"""Create small synthetic in-service fleets and quick models for the four subsets.

Used by CI to build and start the API image without the NASA data or the real models:
``python -m aeromro.data.smoke --data-dir data/raw/CMAPSSData --models-dir models``
The resulting figures mean nothing; the point is to prove the image builds and serves.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np

from aeromro.data.synthetic import synthetic_fleet, write_cmapss
from aeromro.fleet import SUBSETS
from aeromro.rul.model import RULConfig, RULModel
from aeromro.rul.train import truncate_engines

QUICK = RULConfig(max_iter=30, min_samples_leaf=20, long_window=10)


def make_smoke_artifacts(data_dir: Path, models_dir: Path) -> None:
    data_dir.mkdir(parents=True, exist_ok=True)
    for i, (subset, info) in enumerate(SUBSETS.items()):
        conditions = min(info["conditions"], 3)
        train = synthetic_fleet(10, seed=100 + i, n_conditions=conditions)
        in_service, _ = truncate_engines(
            synthetic_fleet(6, seed=200 + i, n_conditions=conditions),
            np.random.default_rng(i),
            cuts_per_engine=1,
        )
        write_cmapss(in_service, data_dir / f"test_{subset}.txt")
        model = RULModel(QUICK, metadata={"subset": subset, "synthetic": True}).fit(train)
        model.save(models_dir / f"rul_{subset}.joblib")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--data-dir", type=Path, default=Path("data/raw/CMAPSSData"))
    parser.add_argument("--models-dir", type=Path, default=Path("models"))
    args = parser.parse_args(argv)
    make_smoke_artifacts(args.data_dir, args.models_dir)
    print(f"synthetic fleets in {args.data_dir}, quick models in {args.models_dir}")


if __name__ == "__main__":
    main()
