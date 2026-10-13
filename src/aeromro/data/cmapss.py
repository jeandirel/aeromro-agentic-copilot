"""Loader for the NASA C-MAPSS turbofan degradation dataset.

Each file (``train_FD00X.txt``, ``test_FD00X.txt``) is whitespace-separated with 26 columns:
engine unit, time in cycles, 3 operational settings and 21 sensor measurements.
``RUL_FD00X.txt`` gives the true remaining useful life (RUL) at the last cycle of each test engine.
See docs/data.md for where to download the files; they are not stored in this repository.
"""

from __future__ import annotations

from os import PathLike
from typing import IO

import pandas as pd

ID_COLUMNS = ["unit", "cycle"]
SETTING_COLUMNS = [f"setting_{i}" for i in range(1, 4)]
SENSOR_COLUMNS = [f"sensor_{i}" for i in range(1, 22)]
COLUMNS = ID_COLUMNS + SETTING_COLUMNS + SENSOR_COLUMNS

Source = str | PathLike[str] | IO[str]


def load_cmapss_file(source: Source) -> pd.DataFrame:
    """Read one train or test file into a typed DataFrame with named columns."""
    df = pd.read_csv(source, sep=r"\s+", header=None, engine="python")
    df = df.dropna(axis=1, how="all")
    if df.shape[1] != len(COLUMNS):
        raise ValueError(f"expected {len(COLUMNS)} columns, got {df.shape[1]}")
    df.columns = COLUMNS
    df[ID_COLUMNS] = df[ID_COLUMNS].astype(int)
    return df.sort_values(ID_COLUMNS).reset_index(drop=True)


def add_rul_labels(df: pd.DataFrame, *, clip: int | None = 125) -> pd.DataFrame:
    """Training labels: engines run to failure, so RUL = last cycle of the unit minus current cycle.

    Clipping (piecewise-linear target) reflects that early cycles show no measurable degradation;
    125 cycles is the value most often used in the C-MAPSS literature.
    """
    out = df.copy()
    last_cycle = out.groupby("unit")["cycle"].transform("max")
    out["rul"] = last_cycle - out["cycle"]
    if clip is not None:
        out["rul"] = out["rul"].clip(upper=clip)
    return out


def load_test_rul(source: Source) -> pd.Series:
    """True RUL at the last observed cycle of each test engine, indexed by unit (1-based)."""
    values = pd.read_csv(source, sep=r"\s+", header=None, engine="python").dropna(axis=1, how="all")
    if values.shape[1] != 1:
        raise ValueError(f"expected 1 column, got {values.shape[1]}")
    series = values.iloc[:, 0].astype(int)
    series.index = pd.RangeIndex(1, len(series) + 1, name="unit")
    return series.rename("rul")


def add_test_rul_labels(
    df: pd.DataFrame, final_rul: pd.Series, *, clip: int | None = 125
) -> pd.DataFrame:
    """Test labels: RUL at a cycle = RUL at the last observed cycle + cycles still to come."""
    missing = set(df["unit"].unique()) - set(final_rul.index)
    if missing:
        raise ValueError(f"no final RUL for units {sorted(missing)}")
    out = df.copy()
    last_cycle = out.groupby("unit")["cycle"].transform("max")
    out["rul"] = out["unit"].map(final_rul) + (last_cycle - out["cycle"])
    if clip is not None:
        out["rul"] = out["rul"].clip(upper=clip)
    return out


def last_cycles(df: pd.DataFrame) -> pd.DataFrame:
    """Last observed row of each engine, the point at which RUL is evaluated on the test set."""
    return df.loc[df.groupby("unit")["cycle"].idxmax()].reset_index(drop=True)
