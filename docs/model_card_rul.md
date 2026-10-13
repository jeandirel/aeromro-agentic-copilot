# Model card: remaining useful life (RUL) of turbofan engines

Version 0.2.0. Code in `src/aeromro/rul/`, figures in [`reports/rul_results.json`](../reports/rul_results.json),
reproduced with:

```bash
python -m aeromro.data.download --dest data/raw/CMAPSSData
python -m aeromro.rul.train --data-dir data/raw/CMAPSSData --out models
```

The **Train RUL model** GitHub Actions workflow runs the same two commands from a clean machine
and publishes the models and the report as build artefacts.

## Intended use

Estimate how many operating cycles an engine has left, with an interval, so that the agents can
decide whether to suggest an inspection. Decision support only: the estimate never grounds an
engine or replaces a certified inspection. Trained and evaluated on **simulated** data (NASA
C-MAPSS, see [data.md](data.md)); it has not been validated on real engines.

## Method

1. **Operating-condition normalisation.** Each cycle is assigned to one of the flight conditions
   seen in training (1 in FD001 and FD003, 6 in FD002 and FD004) and each sensor is z-scored within
   its condition. Sensors that do not vary within a condition are dropped automatically: 14 sensors
   remain in FD001, 16 in the other subsets.
2. **Features per engine and cycle:** 5-cycle mean, 70-cycle mean and 70-cycle slope of each
   sensor, and the number of cycles seen (43 features in FD001, 49 in the other subsets).
3. **Three gradient-boosted tree models** (scikit-learn `HistGradientBoostingRegressor`): the RUL
   itself (squared error) and its 10th and 90th percentiles (quantile loss). Target clipped at 125
   cycles, the usual piecewise-linear target for this dataset.
4. **Conformal calibration of the interval** (conformalised quantile regression, Romano et al.,
   2019): the out-of-fold predictions of the cross-validation set a margin added to both bounds so
   that the interval reaches its 80 % target on engines the model has not seen.

One model per subset; about 1.3 MB each; **about 40 to 45 ms** to estimate one engine from its full
history on a 2-core CPU.

## Evaluation protocol

Nothing is chosen by looking at the test set.

- **Cross-validation** on training engines, 5 folds grouped by engine. Validation engines are cut
  at random cycles (3 cuts per engine), as the official test engines are, and scored at their
  last cycle.
- **Window length** chosen by this cross-validation only, among 20, 30, 50, 70, 100 and 150 cycles,
  on FD001 and FD002. RMSE against the clipped RUL:

  | Long window (cycles) | 20 | 30 | 50 | 70 | 100 | 150 |
  | --- | ---: | ---: | ---: | ---: | ---: | ---: |
  | FD001 | 12.97 | 11.09 | 9.67 | **8.82** | 9.43 | 8.86 |
  | FD002 | | 14.44 | 12.47 | **11.37** | 10.59 | |

  70 and 100 are within noise of each other on average; 70 was kept because it needs less history.
- **Baselines** on the same protocol: a constant (mean RUL of randomly cut training engines) and a
  ridge regression on the same features.
- **Test**: the final model, fitted on all training engines, is scored once on the official test
  engines at their last cycle, against the official `RUL_FD00X.txt` values.

## Results on the official test sets

| Subset | Test engines | Model | Test RMSE | Test RMSE (clipped) | MAE | PHM08 score | Late by > 10 cycles | 80 % interval coverage (clipped) |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| FD001 | 100 | constant | 41.59 | 40.08 | | 10,863 | | |
| | | ridge | 16.69 | 15.34 | | 412 | | |
| | | **model** | **12.21** | **11.03** | 9.11 | **242** | 19 % | 69 % |
| FD002 | 259 | constant | 54.02 | 43.01 | | 128,322 | | |
| | | ridge | 27.74 | 15.42 | | 8,688 | | |
| | | **model** | **22.79** | **10.45** | 14.73 | **3,643** | 14 % | 88 % |
| FD003 | 100 | constant | 41.86 | 39.93 | | 19,248 | | |
| | | ridge | 18.67 | 17.05 | | 792 | | |
| | | **model** | **11.49** | **10.00** | 8.04 | **245** | 12 % | 76 % |
| FD004 | 248 | constant | 54.67 | 43.24 | | 115,578 | | |
| | | ridge | 30.61 | 18.59 | | 7,695 | | |
| | | **model** | **23.84** | **11.34** | 15.91 | **3,190** | 12 % | 81 % |

How to read it:

- **Two RMSE columns.** "Test RMSE" compares with the true RUL; "clipped" compares with the true
  RUL capped at 125 cycles, like the training target. They differ most on FD002 and FD004, where
  57 and 67 test engines have more than 125 cycles left: the model is trained to answer "125 or
  more" for a healthy engine, which is what matters for maintenance planning, but counts as an
  error against the uncapped value. Published C-MAPSS results do not all use the same convention,
  so both are given and no ranking against other work is claimed.
- **PHM08 score** (lower is better) penalises late predictions, which are the dangerous ones,
  more than early ones; it uses the uncapped true RUL.
- **The model beats both baselines on every subset**, for both RMSE columns and the PHM08 score.

### Interval coverage

The 10-90 % interval should contain the true (clipped) RUL 80 % of the time.

| Subset | Before calibration | After calibration | Conformal margin (cycles) | Mean width (cycles) |
| --- | ---: | ---: | ---: | ---: |
| FD001 | 48 % | 69 % | 2.5 | 18.1 |
| FD002 | 79 % | 88 % | 2.0 | 24.1 |
| FD003 | 70 % | 76 % | 1.6 | 23.7 |
| FD004 | 77 % | 81 % | 1.7 | 25.0 |

Calibration brings three subsets close to the target. FD001 stays under it: the cuts made in
cross-validation do not follow exactly the same distribution as the official test cuts, and
conformal guarantees only hold when they do. The agents therefore treat the interval as an
indication of uncertainty, not a guarantee, and the action policy sends low-confidence
recommendations to a human.

## Limits

- Simulated data; real engines have maintenance actions, sensor faults and fleet differences that
  C-MAPSS does not model.
- One model per subset: a new operating regime or fault mode needs retraining.
- The interval is calibrated on cross-validation cuts, not on the test distribution (see above).
- Predictions are capped at 125 cycles by design.
