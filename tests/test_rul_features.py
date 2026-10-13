import numpy as np
import pandas as pd
import pytest

from aeromro.rul.features import ConditionNormalizer, feature_columns, temporal_features


def test_constant_and_binary_sensors_are_dropped(fleet):
    norm = ConditionNormalizer().fit(fleet)
    assert "sensor_1" not in norm.sensors_  # constant
    assert {"sensor_2", "sensor_3", "sensor_4", "sensor_7"} <= set(norm.sensors_)


def test_conditions_are_found_and_normalised(fleet_multi):
    norm = ConditionNormalizer().fit(fleet_multi)
    assert norm.n_conditions == 3
    z = norm.transform(fleet_multi)
    # Within each condition every kept sensor is centred and scaled.
    for _, part in z.groupby("condition"):
        assert np.allclose(part[norm.sensors_].mean(), 0, atol=1e-8)
        assert np.allclose(part[norm.sensors_].std(ddof=0), 1, atol=1e-8)


def test_unseen_rows_go_to_nearest_condition(fleet_multi):
    norm = ConditionNormalizer().fit(fleet_multi)
    probe = fleet_multi.head(3).copy()
    probe[["setting_1", "setting_2", "setting_3"]] = [
        [41.9, 0.84, 60.0],
        [0.1, 0.0, 100.0],
        [20.2, 0.7, 100.0],
    ]
    codes = norm.assign_conditions(probe)
    centroids = norm.centroids_[codes]
    assert np.allclose(centroids[:, 0], [42, 0, 20], atol=0.1)


def test_transform_before_fit_raises(fleet):
    with pytest.raises(RuntimeError):
        ConditionNormalizer().transform(fleet)


def test_temporal_features_slope_and_means():
    df = pd.DataFrame({"unit": [1] * 6, "cycle": range(1, 7), "s": [0.0, 2, 4, 6, 8, 10]})
    feats = temporal_features(df, ["s"], short=2, long=4)
    assert feats["s_mean2"].tolist() == [0, 1, 3, 5, 7, 9]
    assert feats["s_slope4"].iloc[-1] == pytest.approx(2.0)
    assert feats["s_slope4"].iloc[0] == 0  # one point: no slope yet
    assert feats["cycles_seen"].tolist() == [1, 2, 3, 4, 5, 6]
    assert set(feature_columns(feats)) == {"s_mean2", "s_mean4", "s_slope4", "cycles_seen"}


def test_temporal_features_do_not_leak_between_engines():
    df = pd.DataFrame(
        {"unit": [1, 1, 1, 2, 2, 2], "cycle": [1, 2, 3, 1, 2, 3], "s": [0, 0, 0, 100, 100, 100]}
    )
    feats = temporal_features(df, ["s"], short=2, long=3)
    assert feats.loc[feats["unit"] == 2, "s_mean3"].tolist() == [100, 100, 100]
    assert feats.loc[feats["unit"] == 2, "s_slope3"].tolist() == [0, 0, 0]


def test_invalid_windows():
    df = pd.DataFrame({"unit": [1], "cycle": [1], "s": [0.0]})
    with pytest.raises(ValueError):
        temporal_features(df, ["s"], short=3, long=3)
