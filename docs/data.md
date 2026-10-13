# Data

No dataset is stored in this repository. Files go to `data/raw/` (ignored by Git).

## NASA C-MAPSS turbofan engine degradation (engine telemetry)

Simulated run-to-failure data of turbofan engines, produced with the C-MAPSS simulator by the
NASA Prognostics Center of Excellence.

- Dataset page: <https://data.nasa.gov/dataset/cmapss-jet-engine-simulated-data>
- Archive: <https://data.nasa.gov/docs/legacy/CMAPSSData.zip>
- Reference: A. Saxena, K. Goebel, D. Simon and N. Eklund, *Damage Propagation Modeling for
  Aircraft Engine Run-to-Failure Simulation*, PHM08, Denver, CO, October 2008.

| Subset | Train engines | Test engines | Operating conditions | Fault modes |
| --- | --- | --- | --- | --- |
| FD001 | 100 | 100 | 1 (sea level) | 1 (HPC degradation) |
| FD002 | 260 | 259 | 6 | 1 (HPC degradation) |
| FD003 | 100 | 100 | 1 (sea level) | 2 (HPC and fan degradation) |
| FD004 | 248 | 249 | 6 | 2 (HPC and fan degradation) |

Each row is one operating cycle of one engine, 26 space-separated columns: engine unit, cycle,
3 operational settings, 21 sensor measurements. Training engines run until failure; test series
stop earlier, and `RUL_FD00X.txt` gives the true remaining useful life (RUL) at their last cycle.

`aeromro.data.cmapss` reads these files and builds the labels:

- training: `RUL = last cycle of the engine - current cycle`, clipped at 125 cycles by default
  (piecewise-linear target commonly used in the literature, since early cycles show no
  measurable degradation);
- test: `RUL = final RUL from RUL_FD00X.txt + cycles still to come`.

Evaluation (step 2) uses the usual metrics for this dataset: RMSE on the last cycle of each test
engine and the asymmetric PHM08 score, which penalises late predictions more than early ones.

## Regulatory corpus (RAG)

Planned for step 3: a small set of public maintenance regulations and guidance from the US Federal
Aviation Administration (for example 14 CFR Part 43 and FAA advisory circulars on inspection and
repair), downloaded by a script with their source URL kept as metadata so every answer can cite
its passage. The exact list and the terms of use of each source are recorded here when the
corpus is built.

## What is not used

No proprietary, customer or export-controlled data. The project only uses simulated sensor data
and public texts.
