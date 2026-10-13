import math

import pytest

from aeromro.rul.metrics import interval_coverage, late_rate, mae, phm08_score, rmse


def test_rmse_and_mae():
    assert rmse([10, 20], [13, 16]) == pytest.approx(math.sqrt((9 + 16) / 2))
    assert mae([10, 20], [13, 16]) == pytest.approx(3.5)


def test_phm08_penalises_late_more_than_early():
    early = phm08_score([50], [40])  # d = -10
    late = phm08_score([50], [60])  # d = +10
    assert early == pytest.approx(math.exp(10 / 13) - 1)
    assert late == pytest.approx(math.e - 1)
    assert late > early
    assert phm08_score([30, 30], [30, 30]) == 0


def test_interval_coverage_and_late_rate():
    assert interval_coverage([5, 10, 20], [0, 11, 15], [6, 12, 25]) == pytest.approx(2 / 3)
    assert late_rate([10, 10, 10], [5, 21, 30], tolerance=10) == pytest.approx(2 / 3)
