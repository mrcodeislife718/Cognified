# Cognified Evidence and Benchmark Plan

## Primary superiority claims

1. Lower time-to-verified competency than static instruction.
2. Higher delayed retention at matched training time.
3. Higher novel-context transfer at matched initial performance.
4. Lower assistance dependence at matched task difficulty.
5. Hardware portability without changing competency semantics.

## Required measurements

- p50/p95/p99 sensor ingestion latency
- clock synchronization error
- dropped observation rate
- learner-state prediction calibration
- repetitions to competency
- delayed retention delta
- cross-context transfer delta
- assistance dependency
- false-positive competency rate
- false-negative competency rate

## Validation experiments

### Skill IR equivalence
Compile the same skill from at least three source formats and compare expert-rated semantic coverage and resulting learner outcomes.

### Learner Twin prospective prediction
Freeze a learner-state estimate before the next session and score its prediction of execution accuracy, latency, and error categories.

### Practice planner A/B test
Compare adaptive practice against a fixed progression using time-to-competency and delayed retention.

### Sensor reference test
Compare normalized trajectories against a calibrated reference motion system; measure timestamp, position, and sequence error.

### Transfer test
Hold initial competency constant, then assess under unseen but valid contexts.

## Failure policy

Any subsystem whose calibration or outcome performance is worse than the conservative baseline is disabled through policy and the last validated subsystem remains authoritative.