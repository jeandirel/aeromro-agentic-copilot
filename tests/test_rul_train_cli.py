import json

import numpy as np

from aeromro.rul.model import RULModel
from aeromro.rul.train import main, truncate_engines


def write_cmapss(df, path):
    lines = [" ".join(str(v) for v in row) + "  " for row in df.itertuples(index=False)]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def test_train_cli_end_to_end(tmp_path, make_fleet):
    data = tmp_path / "data"
    data.mkdir()
    write_cmapss(make_fleet(10, seed=11), data / "train_FD001.txt")
    test, truth = truncate_engines(
        make_fleet(5, seed=12), np.random.default_rng(0), cuts_per_engine=1
    )
    write_cmapss(test, data / "test_FD001.txt")
    (data / "RUL_FD001.txt").write_text("\n".join(str(v) for v in truth) + "\n", encoding="utf-8")

    report = tmp_path / "report.json"
    main(
        [
            "--data-dir", str(data), "--subsets", "FD001",
            "--out", str(tmp_path / "models"), "--report", str(report),
        ]
    )  # fmt: skip

    result = json.loads(report.read_text())["results"][0]
    assert result["n_test_engines"] == 5
    assert {"model", "ridge", "constant"} <= set(result["test"])
    model = RULModel.load(tmp_path / "models" / "rul_FD001.joblib")
    assert model.metadata["subset"] == "FD001"
    assert "conformal_margin" in model.metadata["interval"]
