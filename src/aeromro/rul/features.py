"""Feature engineering for remaining useful life (RUL) prediction on C-MAPSS.

Two steps, both fitted on training engines only:

1. **Operating-condition normalisation.** In FD002 and FD004 the engines fly in six operating
   conditions (altitude, Mach number, throttle), which move the sensor readings far more than wear
   does. Each cycle is assigned to the nearest condition seen in training, and each sensor is
   z-scored with the mean and standard deviation of that condition. Sensors that do not vary within
   a condition carry no wear signal and are dropped.
2. **Temporal features** per engine: short and long rolling means (noise reduction) and the slope
   of each sensor over the long window (degradation trend).
"""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np
import pandas as pd

from aeromro.data.cmapss import SENSOR_COLUMNS, SETTING_COLUMNS

# Rounding that maps the noisy operational settings to the six C-MAPSS flight conditions.
SETTING_ROUNDING = {"setting_1": 0, "setting_2": 2, "setting_3": 0}


class ConditionNormalizer:
    """Assigns each cycle to an operating condition and z-scores the sensors within it."""

    def __init__(self, *, min_std: float = 1e-3, min_unique: int = 3) -> None:
        self.min_std = min_std
        self.min_unique = min_unique
        self.centroids_: np.ndarray | None = None
        self.settings_scale_: np.ndarray | None = None
        self.means_: np.ndarray | None = None
        self.stds_: np.ndarray | None = None
        self.sensors_: list[str] = []

    def fit(self, df: pd.DataFrame) -> ConditionNormalizer:
        # "+ 0.0" turns -0.0 into 0.0, so noise around zero does not split a condition in two.
        rounded = df[SETTING_COLUMNS].round(SETTING_ROUNDING) + 0.0
        codes = rounded.groupby(SETTING_COLUMNS, sort=True).ngroup().to_numpy()
        settings = df[SETTING_COLUMNS].to_numpy(dtype=float)
        n_conditions = int(codes.max()) + 1
        self.centroids_ = np.vstack(
            [settings[codes == c].mean(axis=0) for c in range(n_conditions)]
        )
        scale = settings.std(axis=0)
        self.settings_scale_ = np.where(scale > 0, scale, 1.0)

        sensors = df[SENSOR_COLUMNS].to_numpy(dtype=float)
        self.means_ = np.vstack([sensors[codes == c].mean(axis=0) for c in range(n_conditions)])
        stds = np.vstack([sensors[codes == c].std(axis=0) for c in range(n_conditions)])
        self.stds_ = np.where(stds > 0, stds, 1.0)

        # Keep a sensor if it varies within at least one condition and is not quasi-binary.
        pooled_std = stds.max(axis=0)
        n_unique = df[SENSOR_COLUMNS].nunique().to_numpy()
        keep = (pooled_std >= self.min_std) & (n_unique >= self.min_unique)
        self.sensors_ = [s for s, k in zip(SENSOR_COLUMNS, keep, strict=True) if k]
        return self

    def assign_conditions(self, df: pd.DataFrame) -> np.ndarray:
        self._check_fitted()
        settings = df[SETTING_COLUMNS].to_numpy(dtype=float) / self.settings_scale_
        centroids = self.centroids_ / self.settings_scale_
        distances = ((settings[:, None, :] - centroids[None, :, :]) ** 2).sum(axis=2)
        return distances.argmin(axis=1)

    def transform(self, df: pd.DataFrame) -> pd.DataFrame:
        """Return unit, cycle, condition and the normalised kept sensors."""
        codes = self.assign_conditions(df)
        sensors = df[SENSOR_COLUMNS].to_numpy(dtype=float)
        z = (sensors - self.means_[codes]) / self.stds_[codes]
        z = pd.DataFrame(z, columns=SENSOR_COLUMNS, index=df.index)[self.sensors_]
        out = df[["unit", "cycle"]].copy()
        out["condition"] = codes
        return pd.concat([out, z], axis=1)

    @property
    def n_conditions(self) -> int:
        self._check_fitted()
        return len(self.centroids_)

    def _check_fitted(self) -> None:
        if self.centroids_ is None:
            raise RuntimeError("ConditionNormalizer is not fitted")


def temporal_features(
    normalised: pd.DataFrame, sensors: Sequence[str], *, short: int = 5, long: int = 20
) -> pd.DataFrame:
    """Rolling means and slopes per engine; rows must be sorted by unit then cycle."""
    if not 1 <= short < long:
        raise ValueError("windows must satisfy 1 <= short < long")
    df = normalised.sort_values(["unit", "cycle"])
    grouped = df.groupby("unit", sort=False)
    sensors = list(sensors)

    def rolling_mean(frame: pd.DataFrame, window: int) -> pd.DataFrame:
        return (
            frame.groupby(df["unit"], sort=False)
            .rolling(window, min_periods=1)
            .mean()
            .reset_index(level=0, drop=True)
        )

    t = df["cycle"].astype(float)
    x = df[sensors]
    mean_short = rolling_mean(x, short).add_suffix(f"_mean{short}")
    mean_x = rolling_mean(x, long)
    mean_t = rolling_mean(t.to_frame("t"), long)["t"]
    mean_xt = rolling_mean(x.mul(t, axis=0), long)
    mean_tt = rolling_mean((t * t).to_frame("tt"), long)["tt"]
    var_t = mean_tt - mean_t**2
    slope = mean_xt.sub(mean_x.mul(mean_t, axis=0)).div(var_t.where(var_t > 0), axis=0)
    slope = slope.fillna(0.0).add_suffix(f"_slope{long}")
    mean_long = mean_x.add_suffix(f"_mean{long}")

    features = pd.concat([df[["unit", "cycle"]], mean_short, mean_long, slope], axis=1).reset_index(
        drop=True
    )
    features["cycles_seen"] = grouped.cumcount().to_numpy() + 1
    return features


def feature_columns(features: pd.DataFrame) -> list[str]:
    return [c for c in features.columns if c not in ("unit", "cycle", "rul")]
