import numpy as np
import pandas as pd
import pytest

from aeromro.data.cmapss import COLUMNS

CONDITIONS = np.array([[0.0, 0.0, 100.0], [20.0, 0.70, 100.0], [42.0, 0.84, 60.0]])


def synthetic_fleet(
    n_engines: int = 12, *, seed: int = 0, n_conditions: int = 1, min_life: int = 80
) -> pd.DataFrame:
    """Run-to-failure engines in C-MAPSS layout: a few sensors drift as wear grows, others are
    constant or pure noise, and the operating condition shifts every sensor."""
    rng = np.random.default_rng(seed)
    rows = []
    for unit in range(1, n_engines + 1):
        life = int(rng.integers(min_life, min_life + 80))
        for cycle in range(1, life + 1):
            cond = rng.integers(0, n_conditions)
            settings = CONDITIONS[cond] + rng.normal(0, [0.002, 0.0002, 0.0], 3)
            wear = np.exp(4 * cycle / life) / np.exp(4)
            sensors = np.full(21, 100.0) + 50.0 * cond
            sensors[1:4] += 10 * wear + rng.normal(0, 0.3, 3)
            sensors[6] -= 8 * wear + rng.normal(0, 0.3)
            sensors[8:12] += rng.normal(0, 0.5, 4)
            rows.append([unit, cycle, *settings, *sensors])
    return pd.DataFrame(rows, columns=COLUMNS)


@pytest.fixture(scope="session")
def fleet() -> pd.DataFrame:
    return synthetic_fleet()


@pytest.fixture(scope="session")
def fleet_multi() -> pd.DataFrame:
    return synthetic_fleet(n_conditions=3, seed=1)


@pytest.fixture(scope="session")
def make_fleet():
    return synthetic_fleet
