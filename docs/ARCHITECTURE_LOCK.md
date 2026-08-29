# Cognified Architecture Lock

Status: **LOCKED**

## Technical moat

Cognified is a skill compiler and human-performance system whose system of truth is verified competency evidence, not model output or course completion.

## Permanent plane separation

1. Intelligence plane — models may decompose source material, propose practice changes, and estimate learner state.
2. Decision plane — policy chooses what may be presented or changed.
3. Truth plane — signed competency evidence records what the learner actually demonstrated.
4. Execution plane — WebXR, OpenXR, mobile, desktop, instrumented tools, or other authorized runtimes present practice.
5. Observation plane — synchronized behavioral and optional physiological signals return evidence.

Model output MUST NOT directly mutate competency truth.

## Locked architecture

SOURCE -> SKILL IR -> LEARNER TWIN -> PRACTICE PLANNER -> RUNTIME ABSTRACTION -> SENSOR FUSION -> COMPETENCY VERIFIER -> RETENTION / TRANSFER -> feedback.

### Skill IR

A skill is decomposed into cognitive, perceptual, decision, and motor primitives plus sequencing, constraints, expected errors, contexts, and assessments. The IR is runtime independent.

### Learner Twin

Learner state tracks knowledge, execution accuracy, speed, variance, error profile, assistance dependence, retention, transfer, fatigue signals, confidence, context sensitivity, automaticity, and uncertainty. Estimates are predictions; observed competency remains authoritative.

### Practice Planner

Practice selection optimizes expected learning gain subject to safety, fatigue, prerequisite, difficulty, and uncertainty constraints. Exploration is bounded and reversible.

### Sensor Fusion

Sensors emit normalized timestamped observations. Behavioral evidence, physiological correlates, and neural measurements are distinct evidence classes and MUST NOT be conflated.

### Transfer Verification

Certification requires skill-specific evidence for current performance, delayed retention, independence, novel-context transfer, error recovery, and automaticity where applicable.

## Scaling doctrine

- 1x: local/individual learner state and sensor streams.
- 10x: cohort analytics, device fleet management, distributed inference, partitioned telemetry.
- 100x: edge preprocessing, regional evidence stores, anonymous normative aggregates, federated model improvement.

## Success-too-well control

A Cognified competency record is never a universal measure of a person. Claims are bound to skill ID, skill version, runtime/context, evidence set, assessment protocol, and validity period.

## Permanent benchmark

Primary metric: time-to-verified competency, delayed retention, and novel-context transfer versus a static curriculum. Architectural changes must improve a measured target or be reverted.