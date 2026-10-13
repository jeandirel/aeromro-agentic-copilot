import pandas as pd
import pytest

from aeromro.data.synthetic import synthetic_fleet


@pytest.fixture(scope="session")
def fleet() -> pd.DataFrame:
    return synthetic_fleet()


@pytest.fixture(scope="session")
def fleet_multi() -> pd.DataFrame:
    return synthetic_fleet(n_conditions=3, seed=1)


@pytest.fixture(scope="session")
def make_fleet():
    return synthetic_fleet
