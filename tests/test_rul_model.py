import numpy as np
import pytest

from aeromro.rul.model import RULConfig, RULModel
from aeromro.rul.train import cross_validate, markdown_table, truncate_engines

FAST = RULConfig(max_iter=60, min_samples_leaf=20, long_window=10)


@pytest.fixture(scope="module")
def fitted(fleet):
    return RULModel(FAST).fit(fleet)


def test_predictions_are_ordered_and_bounded(fitted, make_fleet):
    test = make_fleet(4, seed=42)
    pred = fitted.predict(test)
    assert len(pred) == len(test)
    assert (pred["rul_low"] <= pred["rul"]).all() and (pred["rul"] <= pred["rul_high"]).all()
    assert pred[["rul", "rul_low", "rul_high"]].min().min() >= 0
    assert pred[["rul", "rul_low", "rul_high"]].max().max() <= FAST.clip


def test_model_learns_degradation(fitted, make_fleet):
    test = make_fleet(6, seed=7)
    cut, truth = truncate_engines(test, np.random.default_rng(0), cuts_per_engine=4)
    last = fitted.predict_last(cut).set_index("unit").loc[truth.index]
    error = np.sqrt(np.mean((last["rul"] - np.minimum(truth, FAST.clip)) ** 2))
    assert error < 25  # a constant guess is around 40 on this fleet


def test_predict_last_returns_one_row_per_engine(fitted, make_fleet):
    test = make_fleet(3, seed=3)
    last = fitted.predict_last(test)
    assert last["unit"].tolist() == [1, 2, 3]
    assert (last["cycle"].to_numpy() == test.groupby("unit")["cycle"].max().to_numpy()).all()


def test_calibration_widens_too_narrow_intervals(fleet):
    model = RULModel(FAST).fit(fleet)
    truth = np.array([10.0, 50, 90, 120])
    low, high = truth - 1, truth + 1
    low[:2] = truth[:2] + 5  # two of four intervals miss by 5 cycles
    margin = model.calibrate(truth, low, high, coverage=0.8)
    assert margin == pytest.approx(5.0)
    assert model.metadata["interval"]["n_calibration"] == 4


def test_save_and_load_round_trip(fitted, tmp_path, make_fleet):
    path = fitted.save(tmp_path / "rul.joblib")
    assert path.with_suffix(".json").is_file()
    loaded = RULModel.load(path)
    test = make_fleet(2, seed=5)
    assert np.allclose(loaded.predict(test)["rul"], fitted.predict(test)["rul"])


def test_unfitted_model_raises(fleet):
    with pytest.raises(RuntimeError):
        RULModel(FAST).predict(fleet)


def test_truncation_matches_test_set_layout(fleet):
    cut, truth = truncate_engines(fleet, np.random.default_rng(1), cuts_per_engine=2)
    assert len(truth) == 2 * fleet["unit"].nunique()
    lengths = cut.groupby("unit")["cycle"].max()
    assert (truth > 0).all() and (lengths >= 1).all()


def test_cross_validation_beats_baselines(fleet):
    results, oof = cross_validate(fleet, FAST, n_splits=3)
    assert results["model"]["rmse_clipped"] < results["constant"]["rmse_clipped"]
    assert {"fold", "t", "p", "lo", "hi"} <= set(oof.columns)
    table = markdown_table([{"subset": "SYN", "cv": results, "test": results}])
    assert "| SYN | model |" in table
