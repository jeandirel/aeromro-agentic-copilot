"""RUL model: gradient-boosted trees with a prediction interval.

Three ``HistGradientBoostingRegressor`` share the same features: one predicts the RUL (squared
error), two predict its 10th and 90th percentiles (quantile loss). The interval tells the agent how
sure the estimate is; the harness turns a wide interval into a request for human review.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.ensemble import HistGradientBoostingRegressor

from aeromro import __version__
from aeromro.data.cmapss import add_rul_labels
from aeromro.rul.features import ConditionNormalizer, feature_columns, temporal_features


@dataclass
class RULConfig:
    clip: int = 125
    short_window: int = 5
    long_window: int = 70
    quantiles: tuple[float, float] = (0.1, 0.9)
    learning_rate: float = 0.05
    max_iter: int = 300
    max_leaf_nodes: int = 31
    min_samples_leaf: int = 50
    l2_regularization: float = 1.0
    random_state: int = 0


@dataclass
class RULModel:
    config: RULConfig = field(default_factory=RULConfig)
    metadata: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self.normalizer_: ConditionNormalizer | None = None
        self.features_: list[str] = []
        self.models_: dict[str, HistGradientBoostingRegressor] = {}
        self.interval_margin_: float = 0.0

    def calibrate(
        self,
        true_rul: np.ndarray,
        low: np.ndarray,
        high: np.ndarray,
        *,
        coverage: float | None = None,
    ) -> float:
        """Conformalised quantile regression: widen (or narrow) the interval by a margin learnt on
        held-out engines so that it reaches the target coverage (Romano et al., 2019).

        ``low`` and ``high`` must be the raw quantile predictions, made by models that did not see
        these engines (for example out-of-fold predictions from cross-validation).
        """
        if coverage is None:
            coverage = self.config.quantiles[1] - self.config.quantiles[0]
        y = np.minimum(np.asarray(true_rul, dtype=float), self.config.clip)
        errors = np.maximum(np.asarray(low) - y, y - np.asarray(high))
        n = len(errors)
        level = min(1.0, np.ceil((n + 1) * coverage) / n)
        self.interval_margin_ = float(np.quantile(errors, level, method="higher"))
        self.metadata["interval"] = {
            "target_coverage": round(coverage, 4),
            "conformal_margin": round(self.interval_margin_, 4),
            "n_calibration": n,
        }
        return self.interval_margin_

    # ------------------------------------------------------------------ training
    def _regressor(self, **loss: Any) -> HistGradientBoostingRegressor:
        c = self.config
        return HistGradientBoostingRegressor(
            learning_rate=c.learning_rate,
            max_iter=c.max_iter,
            max_leaf_nodes=c.max_leaf_nodes,
            min_samples_leaf=c.min_samples_leaf,
            l2_regularization=c.l2_regularization,
            random_state=c.random_state,
            **loss,
        )

    def featurize(self, df: pd.DataFrame) -> pd.DataFrame:
        if self.normalizer_ is None:
            raise RuntimeError("model is not fitted")
        normalised = self.normalizer_.transform(df)
        return temporal_features(
            normalised,
            self.normalizer_.sensors_,
            short=self.config.short_window,
            long=self.config.long_window,
        )

    def fit(self, train: pd.DataFrame) -> RULModel:
        """Fit on run-to-failure engines (raw C-MAPSS columns)."""
        self.normalizer_ = ConditionNormalizer().fit(train)
        feats = self.featurize(train)
        labels = add_rul_labels(train, clip=self.config.clip)[["unit", "cycle", "rul"]]
        feats = feats.merge(labels, on=["unit", "cycle"], how="left", validate="one_to_one")
        self.features_ = feature_columns(feats)
        x, y = feats[self.features_].to_numpy(), feats["rul"].to_numpy(dtype=float)

        low_q, high_q = self.config.quantiles
        self.models_ = {
            "point": self._regressor(loss="squared_error").fit(x, y),
            "low": self._regressor(loss="quantile", quantile=low_q).fit(x, y),
            "high": self._regressor(loss="quantile", quantile=high_q).fit(x, y),
        }
        self.metadata.update(
            {
                "trained_at": datetime.now(UTC).isoformat(timespec="seconds"),
                "aeromro_version": __version__,
                "sklearn_version": sklearn.__version__,
                "n_train_engines": int(train["unit"].nunique()),
                "n_train_rows": len(train),
                "n_conditions": self.normalizer_.n_conditions,
                "sensors": list(self.normalizer_.sensors_),
                "n_features": len(self.features_),
                "config": asdict(self.config),
            }
        )
        return self

    # ---------------------------------------------------------------- prediction
    def predict(self, df: pd.DataFrame, *, calibrated: bool = True) -> pd.DataFrame:
        """RUL estimate and interval for every cycle of every engine in ``df``."""
        if not self.models_:
            raise RuntimeError("model is not fitted")
        feats = self.featurize(df)
        x = feats[self.features_].to_numpy()
        clip = self.config.clip
        margin = self.interval_margin_ if calibrated else 0.0
        point = np.clip(self.models_["point"].predict(x), 0, clip)
        low = np.clip(self.models_["low"].predict(x) - margin, 0, clip)
        high = np.clip(self.models_["high"].predict(x) + margin, 0, clip)
        # Quantile models are trained separately and can cross; keep low <= point <= high.
        low, high = np.minimum(low, point), np.maximum(high, point)
        return pd.DataFrame(
            {
                "unit": feats["unit"].to_numpy(),
                "cycle": feats["cycle"].to_numpy(),
                "rul": point,
                "rul_low": low,
                "rul_high": high,
            }
        )

    def predict_last(self, df: pd.DataFrame, *, calibrated: bool = True) -> pd.DataFrame:
        """Estimate at the last observed cycle of each engine (what a fleet dashboard shows)."""
        pred = self.predict(df, calibrated=calibrated)
        return pred.loc[pred.groupby("unit")["cycle"].idxmax()].reset_index(drop=True)

    # --------------------------------------------------------------- persistence
    def save(self, path: str | Path) -> Path:
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(self, path, compress=3)
        path.with_suffix(".json").write_text(json.dumps(self.metadata, indent=2), encoding="utf-8")
        return path

    @classmethod
    def load(cls, path: str | Path) -> RULModel:
        model = joblib.load(path)
        if not isinstance(model, cls):
            raise TypeError(f"{path} does not contain a RULModel")
        trained_with = model.metadata.get("sklearn_version")
        if trained_with and trained_with != sklearn.__version__:
            import warnings

            warnings.warn(
                f"model trained with scikit-learn {trained_with}, running {sklearn.__version__}",
                stacklevel=2,
            )
        return model
