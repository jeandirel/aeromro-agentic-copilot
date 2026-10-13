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
| FD004 | 249 | 248 | 6 | 2 (HPC and fan degradation) |

The engine counts above are counted in the files. The official readme announces 248 training and
249 test engines for FD004; the files contain the reverse (249 and 248, and `RUL_FD004.txt` has 248
lines), so the readme swaps the two numbers.

### Getting the files

```bash
python -m aeromro.data.download --dest data/raw/CMAPSSData           # from NASA
python -m aeromro.data.download --dest data/raw/CMAPSSData --verify-only
```

The script downloads the archive (3 attempts with exponential backoff; if NASA stays
unreachable it falls back to a public copy of the same files on GitHub), extracts the 12 data files (looking inside a nested archive if
there is one) and checks each against the SHA-256 checksum of the files used for the published
results. Checksums are computed after normalising line endings, so a copy saved on Windows still
passes, while any changed value is rejected. Copies found elsewhere (Kaggle, IEEE DataPort, GitHub
mirrors) can be used with `--from-zip` and are accepted only if they are byte-identical in content.
The results in this repository were produced with files that pass this check.

### Layout

Each row is one operating cycle of one engine, 26 space-separated columns: engine unit, cycle,
3 operational settings, 21 sensor measurements. Training engines run until failure; test series
stop earlier, and `RUL_FD00X.txt` gives the true remaining useful life (RUL) at their last cycle.

`aeromro.data.cmapss` reads these files and builds the labels:

- training: `RUL = last cycle of the engine - current cycle`, clipped at 125 cycles by default
  (piecewise-linear target commonly used in the literature, since early cycles show no
  measurable degradation);
- test: `RUL = final RUL from RUL_FD00X.txt + cycles still to come`.

The RUL model and its evaluation are described in the [model card](model_card_rul.md).

## Regulatory corpus (RAG)

Planned for step 3: a small set of public maintenance regulations and guidance from the US Federal
Aviation Administration (for example 14 CFR Part 43 and FAA advisory circulars on inspection and
repair), downloaded by a script with their source URL kept as metadata so every answer can cite
its passage. The exact list and the terms of use of each source are recorded here when the
corpus is built.

## What is not used

No proprietary, customer or export-controlled data. The project only uses simulated sensor data
and public texts.
