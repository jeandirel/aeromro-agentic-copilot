import io

import pytest

from aeromro.data import (
    COLUMNS,
    add_rul_labels,
    add_test_rul_labels,
    last_cycles,
    load_cmapss_file,
    load_test_rul,
)


def make_rows(unit: int, cycles: int) -> str:
    """Synthetic lines in the C-MAPSS layout, with the trailing spaces the real files have."""
    lines = []
    for c in range(1, cycles + 1):
        settings = [0.001 * c, -0.0003, 100.0]
        sensors = [500.0 + c * 0.1 + i for i in range(21)]
        values = [unit, c, *settings, *sensors]
        lines.append(" ".join(str(v) for v in values) + "  ")
    return "\n".join(lines)


@pytest.fixture
def train_text():
    return make_rows(1, 5) + "\n" + make_rows(2, 3) + "\n"


def test_load_names_and_types(train_text):
    df = load_cmapss_file(io.StringIO(train_text))
    assert list(df.columns) == COLUMNS
    assert len(df) == 8
    assert df["unit"].dtype.kind == "i"
    assert df["cycle"].dtype.kind == "i"


def test_load_rejects_wrong_width():
    with pytest.raises(ValueError, match="26 columns"):
        load_cmapss_file(io.StringIO("1 1 0.1 0.2\n1 2 0.1 0.2\n"))


def test_train_rul_labels_and_clip(train_text):
    df = add_rul_labels(load_cmapss_file(io.StringIO(train_text)), clip=3)
    unit1 = df[df["unit"] == 1]["rul"].tolist()
    assert unit1 == [3, 3, 2, 1, 0]  # 4 clipped to 3
    unit2 = df[df["unit"] == 2]["rul"].tolist()
    assert unit2 == [2, 1, 0]


def test_train_rul_without_clip(train_text):
    df = add_rul_labels(load_cmapss_file(io.StringIO(train_text)), clip=None)
    assert df[df["unit"] == 1]["rul"].max() == 4


def test_test_rul_labels(train_text):
    df = load_cmapss_file(io.StringIO(train_text))
    final = load_test_rul(io.StringIO("10 \n20 \n"))
    assert final.loc[1] == 10 and final.loc[2] == 20
    labelled = add_test_rul_labels(df, final, clip=None)
    assert labelled[labelled["unit"] == 1]["rul"].tolist() == [14, 13, 12, 11, 10]
    assert labelled[labelled["unit"] == 2]["rul"].tolist() == [22, 21, 20]


def test_test_rul_missing_unit(train_text):
    df = load_cmapss_file(io.StringIO(train_text))
    with pytest.raises(ValueError, match="no final RUL"):
        add_test_rul_labels(df, load_test_rul(io.StringIO("10\n")))


def test_last_cycles(train_text):
    last = last_cycles(load_cmapss_file(io.StringIO(train_text)))
    assert last[["unit", "cycle"]].values.tolist() == [[1, 5], [2, 3]]
