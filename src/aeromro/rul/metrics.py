"""Evaluation metrics for RUL prediction."""

from __future__ import annotations

import numpy as np
from numpy.typing import ArrayLike


def rmse(y_true: ArrayLike, y_pred: ArrayLike) -> float:
    t, p = np.asarray(y_true, dtype=float), np.asarray(y_pred, dtype=float)
    return float(np.sqrt(np.mean((p - t) ** 2)))


def mae(y_true: ArrayLike, y_pred: ArrayLike) -> float:
    t, p = np.asarray(y_true, dtype=float), np.asarray(y_pred, dtype=float)
    return float(np.mean(np.abs(p - t)))


def phm08_score(y_true: ArrayLike, y_pred: ArrayLike) -> float:
    """Asymmetric score of the PHM08 challenge (lower is better).

    With d = predicted - true RUL, each engine adds exp(-d/13) - 1 when the prediction is early
    (d < 0) and exp(d/10) - 1 when it is late (d >= 0): announcing a failure too late costs more.
    """
    d = np.asarray(y_pred, dtype=float) - np.asarray(y_true, dtype=float)
    return float(np.sum(np.where(d < 0, np.exp(-d / 13.0) - 1.0, np.exp(d / 10.0) - 1.0)))


def interval_coverage(y_true: ArrayLike, low: ArrayLike, high: ArrayLike) -> float:
    """Share of true values inside [low, high]."""
    t = np.asarray(y_true, dtype=float)
    return float(
        np.mean((t >= np.asarray(low, dtype=float)) & (t <= np.asarray(high, dtype=float)))
    )


def late_rate(y_true: ArrayLike, y_pred: ArrayLike, *, tolerance: float = 0.0) -> float:
    """Share of engines whose RUL is over-estimated by more than ``tolerance`` cycles."""
    d = np.asarray(y_pred, dtype=float) - np.asarray(y_true, dtype=float)
    return float(np.mean(d > tolerance))
