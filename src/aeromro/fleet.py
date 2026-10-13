"""Fleet service: the engines in service and what the RUL model says about each of them.

The in-service fleet is the official C-MAPSS test set: engines observed up to some cycle, still
flying. For each engine the service gives the RUL estimate, its interval, a maintenance status and
how confident that status is. Models and data are loaded lazily, once per subset.
"""

from __future__ import annotations

import argparse
import json
import threading
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Literal

import pandas as pd

from aeromro.data.cmapss import load_cmapss_file
from aeromro.rul.model import RULModel

SUBSETS: dict[str, dict[str, Any]] = {
    "FD001": {"conditions": 1, "fault_modes": ["HPC degradation"]},
    "FD002": {"conditions": 6, "fault_modes": ["HPC degradation"]},
    "FD003": {"conditions": 1, "fault_modes": ["HPC degradation", "fan degradation"]},
    "FD004": {"conditions": 6, "fault_modes": ["HPC degradation", "fan degradation"]},
}

# Sensor meanings from Saxena et al. (2008), table 2.
SENSORS: dict[str, str] = {
    "sensor_1": "T2, total temperature at fan inlet",
    "sensor_2": "T24, total temperature at LPC outlet",
    "sensor_3": "T30, total temperature at HPC outlet",
    "sensor_4": "T50, total temperature at LPT outlet",
    "sensor_5": "P2, pressure at fan inlet",
    "sensor_6": "P15, total pressure in bypass duct",
    "sensor_7": "P30, total pressure at HPC outlet",
    "sensor_8": "Nf, physical fan speed",
    "sensor_9": "Nc, physical core speed",
    "sensor_10": "epr, engine pressure ratio",
    "sensor_11": "Ps30, static pressure at HPC outlet",
    "sensor_12": "phi, ratio of fuel flow to Ps30",
    "sensor_13": "NRf, corrected fan speed",
    "sensor_14": "NRc, corrected core speed",
    "sensor_15": "BPR, bypass ratio",
    "sensor_16": "farB, burner fuel-air ratio",
    "sensor_17": "htBleed, bleed enthalpy",
    "sensor_18": "Nf_dmd, demanded fan speed",
    "sensor_19": "PCNfR_dmd, demanded corrected fan speed",
    "sensor_20": "W31, HPT coolant bleed",
    "sensor_21": "W32, LPT coolant bleed",
}

# Sensors shown in engine histories (present in every subset after sensor selection).
KEY_SENSORS = ["sensor_4", "sensor_7", "sensor_11", "sensor_12"]

Status = Literal["inspect_now", "plan_inspection", "healthy"]


@dataclass(frozen=True)
class Thresholds:
    inspect_now: int = 15
    plan_inspection: int = 50

    def band(self, rul: float) -> Status:
        if rul <= self.inspect_now:
            return "inspect_now"
        if rul <= self.plan_inspection:
            return "plan_inspection"
        return "healthy"

    def band_limits(self, status: Status) -> tuple[float, float]:
        return {
            "inspect_now": (float("-inf"), float(self.inspect_now)),
            "plan_inspection": (float(self.inspect_now), float(self.plan_inspection)),
            "healthy": (float(self.plan_inspection), float("inf")),
        }[status]


def assess(rul: float, low: float, high: float, thresholds: Thresholds) -> tuple[Status, float]:
    """Status of the point estimate, and the share of the interval that agrees with it.

    An interval entirely inside one band gives confidence 1; an interval straddling a threshold
    gives the fraction of its width on the side of the point estimate.
    """
    status = thresholds.band(rul)
    if high - low <= 1e-9:
        return status, 1.0
    lo_band, hi_band = thresholds.band_limits(status)
    overlap = max(0.0, min(high, hi_band) - max(low, lo_band))
    return status, round(overlap / (high - low), 3)


@dataclass
class EngineAssessment:
    subset: str
    unit: int
    cycles_flown: int
    rul: float
    rul_low: float
    rul_high: float
    status: Status
    confidence: float

    def as_dict(self) -> dict[str, Any]:
        return {
            "subset": self.subset,
            "unit": self.unit,
            "cycles_flown": self.cycles_flown,
            "rul": round(self.rul, 1),
            "rul_low": round(self.rul_low, 1),
            "rul_high": round(self.rul_high, 1),
            "status": self.status,
            "confidence": self.confidence,
        }


class UnknownSubsetError(KeyError):
    pass


class UnknownEngineError(KeyError):
    pass


class FleetService:
    """Assessments of every in-service engine, plus per-engine histories on demand.

    Assessments can be precomputed into ``fleet_FD00X.json`` next to the models (done when the
    API image is built), so that listing a fleet does not need to load data or run the model.
    """

    def __init__(self, data_dir: Path, models_dir: Path, thresholds: Thresholds | None = None):
        self.data_dir = Path(data_dir)
        self.models_dir = Path(models_dir)
        self.thresholds = thresholds or Thresholds()
        self._loaded: dict[str, tuple[pd.DataFrame, RULModel]] = {}
        self._assessments: dict[str, dict[int, EngineAssessment]] = {}
        self._lock = threading.RLock()

    def _paths(self, subset: str) -> tuple[Path, Path]:
        return self.data_dir / f"test_{subset}.txt", self.models_dir / f"rul_{subset}.joblib"

    def _cache_path(self, subset: str) -> Path:
        return self.models_dir / f"fleet_{subset}.json"

    def available_subsets(self) -> list[str]:
        return [s for s in SUBSETS if all(p.is_file() for p in self._paths(s))]

    def _check(self, subset: str) -> None:
        if subset not in SUBSETS or subset not in self.available_subsets():
            raise UnknownSubsetError(subset)

    def metadata(self, subset: str) -> dict[str, Any]:
        self._check(subset)
        path = self.models_dir / f"rul_{subset}.json"
        return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {}

    def _engines_and_model(self, subset: str) -> tuple[pd.DataFrame, RULModel]:
        self._check(subset)
        with self._lock:
            if subset not in self._loaded:
                data_path, model_path = self._paths(subset)
                self._loaded[subset] = (load_cmapss_file(data_path), RULModel.load(model_path))
        return self._loaded[subset]

    def _cache_key(self, subset: str) -> dict[str, Any]:
        return {
            "model_trained_at": self.metadata(subset).get("trained_at"),
            "thresholds": [self.thresholds.inspect_now, self.thresholds.plan_inspection],
        }

    def _compute(self, subset: str) -> dict[int, EngineAssessment]:
        engines, model = self._engines_and_model(subset)
        last = model.predict_last(engines)
        out = {}
        for row in last.itertuples(index=False):
            status, confidence = assess(row.rul, row.rul_low, row.rul_high, self.thresholds)
            out[int(row.unit)] = EngineAssessment(
                subset=subset,
                unit=int(row.unit),
                cycles_flown=int(row.cycle),
                rul=float(row.rul),
                rul_low=float(row.rul_low),
                rul_high=float(row.rul_high),
                status=status,
                confidence=confidence,
            )
        return out

    def _load_assessments(self, subset: str) -> dict[int, EngineAssessment]:
        self._check(subset)
        with self._lock:
            if subset not in self._assessments:
                cache = self._cache_path(subset)
                cached = json.loads(cache.read_text(encoding="utf-8")) if cache.is_file() else {}
                if cached.get("key") == self._cache_key(subset):
                    self._assessments[subset] = {
                        int(e["unit"]): EngineAssessment(**e) for e in cached["engines"]
                    }
                else:
                    self._assessments[subset] = self._compute(subset)
        return self._assessments[subset]

    def precompute(self) -> list[Path]:
        """Write the assessments of every available subset next to its model."""
        written = []
        for subset in self.available_subsets():
            assessments = self._compute(subset)
            payload = {
                "key": self._cache_key(subset),
                "engines": [asdict(a) for a in assessments.values()],
            }
            path = self._cache_path(subset)
            path.write_text(json.dumps(payload), encoding="utf-8")
            written.append(path)
        return written

    def fleet(self, subset: str) -> list[EngineAssessment]:
        return sorted(self._load_assessments(subset).values(), key=lambda a: (a.rul, a.unit))

    def assessment(self, subset: str, unit: int) -> EngineAssessment:
        assessments = self._load_assessments(subset)
        if unit not in assessments:
            raise UnknownEngineError(unit)
        return assessments[unit]

    def history(self, subset: str, unit: int, *, last: int = 60) -> list[dict[str, float]]:
        """RUL estimate and condition-normalised key sensors over the last cycles."""
        self.assessment(subset, unit)  # raises for an unknown engine
        engines, model = self._engines_and_model(subset)
        engine = engines[engines["unit"] == unit]
        pred = model.predict(engine).tail(last)
        normalised = model.normalizer_.transform(engine).tail(last)
        sensors = [s for s in KEY_SENSORS if s in normalised.columns]
        out = []
        for p, (_, n) in zip(pred.itertuples(index=False), normalised.iterrows(), strict=True):
            row = {
                "cycle": int(p.cycle),
                "rul": round(float(p.rul), 1),
                "rul_low": round(float(p.rul_low), 1),
                "rul_high": round(float(p.rul_high), 1),
            }
            row.update({s: round(float(n[s]), 3) for s in sensors})
            out.append(row)
        return out

    def model_info(self, subset: str) -> dict[str, Any]:
        meta = self.metadata(subset)
        test = meta.get("evaluation", {}).get("test", {})
        return {
            "subset": subset,
            "trained_at": meta.get("trained_at"),
            "sklearn_version": meta.get("sklearn_version"),
            "n_train_engines": meta.get("n_train_engines"),
            "sensors": meta.get("sensors", []),
            "interval": meta.get("interval", {}),
            "test": {
                k: test.get(k)
                for k in ("rmse", "rmse_clipped", "phm08_score", "interval_coverage_clipped")
            },
        }


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Precompute fleet assessments for the API.")
    parser.add_argument("--data-dir", type=Path, default=Path("data/raw/CMAPSSData"))
    parser.add_argument("--models-dir", type=Path, default=Path("models"))
    args = parser.parse_args(argv)
    for path in FleetService(args.data_dir, args.models_dir).precompute():
        print(f"ok  {path}")


if __name__ == "__main__":
    main()
