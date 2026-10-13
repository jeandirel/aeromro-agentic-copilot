"""Train and evaluate the RUL model on the C-MAPSS subsets.

``python -m aeromro.rul.train --data-dir data/raw/CMAPSSData --out models``

Protocol (nothing is chosen by looking at the test set):

1. **Cross-validation on training engines**, grouped by engine (5 folds). Validation engines are
   cut at random cycles, as the official test engines are, and scored at their last cycle.
2. **Baselines** on the same protocol: a constant prediction and a ridge regression on the same
   features, so the gain of the model is measured, not assumed.
3. **Interval calibration**: the out-of-fold predictions of step 1 set the conformal margin that
   brings the 10-90 % interval to its 80 % target coverage.
4. **Final model** fitted on all training engines, scored once on the official test set against
   the official RUL files.
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from aeromro.data.cmapss import add_rul_labels, load_cmapss_file, load_test_rul
from aeromro.rul.features import ConditionNormalizer, feature_columns
from aeromro.rul.metrics import interval_coverage, late_rate, mae, phm08_score, rmse
from aeromro.rul.model import RULConfig, RULModel

SUBSETS = ("FD001", "FD002", "FD003", "FD004")


def truncate_engines(
    df: pd.DataFrame, rng: np.random.Generator, *, cuts_per_engine: int = 3, min_cycles: int = 30
) -> tuple[pd.DataFrame, pd.Series]:
    """Cut run-to-failure engines at random cycles, like the official test set.

    Returns the truncated series (each cut gets its own unit id) and the true RUL at the cut.
    """
    parts, truth = [], {}
    next_id = 1
    for _, engine in df.groupby("unit", sort=True):
        life = int(engine["cycle"].max())
        low = min(min_cycles, life - 1)
        for cut in rng.integers(low, life, size=cuts_per_engine):
            piece = engine[engine["cycle"] <= cut].copy()
            piece["unit"] = next_id
            parts.append(piece)
            truth[next_id] = life - int(cut)
            next_id += 1
    rul = pd.Series(truth, name="rul")
    rul.index.name = "unit"
    return pd.concat(parts, ignore_index=True), rul


def score(
    true_rul: np.ndarray,
    pred: np.ndarray,
    low: np.ndarray | None = None,
    high: np.ndarray | None = None,
    *,
    clip: int,
) -> dict[str, float]:
    """Errors against the true RUL and against the RUL clipped like the training target."""
    clipped = np.minimum(true_rul, clip)
    out = {
        "rmse": rmse(true_rul, pred),
        "rmse_clipped": rmse(clipped, pred),
        "mae": mae(true_rul, pred),
        "phm08_score": phm08_score(true_rul, pred),
        "phm08_score_clipped": phm08_score(clipped, pred),
        "late_rate_10": late_rate(true_rul, pred, tolerance=10),
    }
    if low is not None and high is not None:
        out["interval_coverage_clipped"] = interval_coverage(clipped, low, high)
        out["interval_mean_width"] = float(np.mean(high - low))
    out = {k: round(v, 4) for k, v in out.items()}
    out["n"] = len(true_rul)
    return out


def ridge_last(train: pd.DataFrame, evaluate: pd.DataFrame, config: RULConfig) -> np.ndarray:
    """Baseline: ridge regression on the same features, scored at each engine's last cycle."""
    helper = RULModel(config)
    helper.normalizer_ = ConditionNormalizer().fit(train)
    labels = add_rul_labels(train, clip=config.clip)[["unit", "cycle", "rul"]]
    feats = helper.featurize(train).merge(labels, on=["unit", "cycle"])
    cols = feature_columns(feats)
    ridge = make_pipeline(StandardScaler(), Ridge(alpha=1.0)).fit(feats[cols], feats["rul"])
    ev = helper.featurize(evaluate)
    last = ev.loc[ev.groupby("unit")["cycle"].idxmax()]
    return np.clip(ridge.predict(last[cols]), 0, config.clip)


def constant_baseline(train: pd.DataFrame, config: RULConfig, seed: int = 0) -> float:
    """Mean clipped RUL of randomly cut training engines."""
    _, rul = truncate_engines(train, np.random.default_rng(seed))
    return float(np.minimum(rul, config.clip).mean())


def cross_validate(
    train: pd.DataFrame, config: RULConfig, *, n_splits: int = 5, seed: int = 0
) -> tuple[dict[str, dict[str, float]], pd.DataFrame]:
    """Scores of the model and baselines, plus the model's raw out-of-fold predictions."""
    rng = np.random.default_rng(seed)
    units = train["unit"].to_numpy()
    frames: dict[str, list[pd.DataFrame]] = {"model": [], "ridge": [], "constant": []}
    for fold, (train_idx, val_idx) in enumerate(
        GroupKFold(n_splits=n_splits).split(train, groups=units)
    ):
        fold_train, fold_val = train.iloc[train_idx], train.iloc[val_idx]
        val_cut, val_rul = truncate_engines(fold_val, rng)
        truth = val_rul.to_numpy(dtype=float)

        model = RULModel(config).fit(fold_train)
        last = model.predict_last(val_cut, calibrated=False).set_index("unit").loc[val_rul.index]
        frames["model"].append(
            pd.DataFrame(
                {
                    "fold": fold,
                    "t": truth,
                    "p": last["rul"].to_numpy(),
                    "lo": last["rul_low"].to_numpy(),
                    "hi": last["rul_high"].to_numpy(),
                }
            )
        )
        frames["ridge"].append(
            pd.DataFrame({"t": truth, "p": ridge_last(fold_train, val_cut, config)})
        )
        const = constant_baseline(fold_train, config, seed=seed + fold)
        frames["constant"].append(pd.DataFrame({"t": truth, "p": np.full_like(truth, const)}))

    results = {}
    for name, parts in frames.items():
        r = pd.concat(parts, ignore_index=True)
        lo, hi = (r["lo"].to_numpy(), r["hi"].to_numpy()) if "lo" in r else (None, None)
        results[name] = score(r["t"].to_numpy(), r["p"].to_numpy(), lo, hi, clip=config.clip)
    return results, pd.concat(frames["model"], ignore_index=True)


def single_engine_latency_ms(model: RULModel, df: pd.DataFrame, n: int = 20) -> float:
    """Median time to estimate one engine from its full history (the API use case)."""
    timings = []
    for unit in df["unit"].unique()[:n]:
        engine = df[df["unit"] == unit]
        t0 = time.perf_counter()
        model.predict_last(engine)
        timings.append((time.perf_counter() - t0) * 1000)
    return float(np.median(timings))


def run_subset(
    data_dir: Path, subset: str, config: RULConfig, out_dir: Path | None
) -> dict[str, Any]:
    train = load_cmapss_file(data_dir / f"train_{subset}.txt")
    test = load_cmapss_file(data_dir / f"test_{subset}.txt")
    final_rul = load_test_rul(data_dir / f"RUL_{subset}.txt")
    started = time.perf_counter()

    cv, oof = cross_validate(train, config)

    model = RULModel(config, metadata={"subset": subset}).fit(train)
    model.calibrate(oof["t"].to_numpy(), oof["lo"].to_numpy(), oof["hi"].to_numpy())

    truth = final_rul.to_numpy(dtype=float)
    last = model.predict_last(test).set_index("unit").loc[final_rul.index]
    raw = model.predict_last(test, calibrated=False).set_index("unit").loc[final_rul.index]
    test_scores = {
        "model": score(
            truth,
            last["rul"].to_numpy(),
            last["rul_low"].to_numpy(),
            last["rul_high"].to_numpy(),
            clip=config.clip,
        ),
        "ridge": score(truth, ridge_last(train, test, config), clip=config.clip),
        "constant": score(
            truth, np.full_like(truth, constant_baseline(train, config)), clip=config.clip
        ),
    }
    test_scores["model"]["interval_coverage_uncalibrated"] = round(
        interval_coverage(
            np.minimum(truth, config.clip), raw["rul_low"].to_numpy(), raw["rul_high"].to_numpy()
        ),
        4,
    )

    result = {
        "subset": subset,
        "n_train_engines": int(train["unit"].nunique()),
        "n_test_engines": int(test["unit"].nunique()),
        "cv": cv,
        "test": test_scores,
        "conformal_margin": round(model.interval_margin_, 4),
        "predict_ms_single_engine": round(single_engine_latency_ms(model, test), 2),
        "elapsed_s": round(time.perf_counter() - started, 1),
    }
    model.metadata["evaluation"] = {"cv": cv["model"], "test": test_scores["model"]}
    if out_dir is not None:
        model.save(out_dir / f"rul_{subset}.joblib")
    return result


def markdown_table(results: list[dict[str, Any]]) -> str:
    lines = [
        "| Subset | Model | CV RMSE* | Test RMSE | Test RMSE* | Test PHM08 "
        "| 80 % interval coverage* |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    for r in results:
        for name in ("constant", "ridge", "model"):
            cv, te = r["cv"][name], r["test"][name]
            cover = te.get("interval_coverage_clipped")
            lines.append(
                f"| {r['subset']} | {name} | {cv['rmse_clipped']:.2f} | {te['rmse']:.2f} | "
                f"{te['rmse_clipped']:.2f} | {te['phm08_score']:,.0f} | "
                f"{'' if cover is None else f'{cover:.0%}'} |"
            )
    lines.append("")
    lines.append("\\* against the true RUL clipped at 125 cycles, like the training target.")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Train and evaluate the C-MAPSS RUL model.")
    parser.add_argument("--data-dir", type=Path, default=Path("data/raw/CMAPSSData"))
    parser.add_argument("--subsets", nargs="+", default=list(SUBSETS), choices=SUBSETS)
    parser.add_argument("--out", type=Path, default=Path("models"))
    parser.add_argument("--report", type=Path, default=Path("reports/rul_results.json"))
    args = parser.parse_args(argv)

    config = RULConfig()
    results = []
    for subset in args.subsets:
        print(f"[{subset}] cross-validation, training and test...", flush=True)
        results.append(run_subset(args.data_dir, subset, config, args.out))
        t = results[-1]["test"]["model"]
        print(f"[{subset}] test RMSE {t['rmse']:.2f}, PHM08 {t['phm08_score']:.0f}", flush=True)

    args.report.parent.mkdir(parents=True, exist_ok=True)
    payload = {"config": RULConfig().__dict__, "results": results}
    args.report.write_text(json.dumps(payload, indent=2, default=list), encoding="utf-8")
    print(markdown_table(results))


if __name__ == "__main__":
    main()
