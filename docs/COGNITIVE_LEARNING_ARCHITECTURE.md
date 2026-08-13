# Cognified Cognitive Learning Architecture

## System boundary

Cognified is implemented as a measurable learning and competency platform. Its production runtime does not assume that hypnosis, binaural audio, subliminal presentation, or fixed-frequency stimulation can upload arbitrary knowledge or skills into the brain.

The implemented production path is:

```text
source material
  -> skill graph compilation
  -> package validation and integrity digest
  -> persisted skill package
  -> learner session state
  -> adaptive learning experience
  -> runtime observation/evidence
  -> learner-state update
  -> competency scoring
  -> next experience
```

## Runtime components

- `src/compiler.ts`: source-to-skill-graph compiler
- `src/package-validator.ts`: structural validation and SHA-256 integrity digest
- `src/repository.ts`: persistent skill, learner-state, and event repository
- `src/learning-engine.ts`: adaptive progression engine
- `src/scoring.ts`: competency evidence aggregation
- `src/runtime-contract.ts`: spatial-runtime adapter boundary
- `src/service.ts`: application orchestration
- `src/server.ts`: HTTP API and browser runtime host
- `src/cli.ts`: command-line entry point
- `apps/web`: browser and WebXR-capable client surface
- `src/e2e.test.ts`: end-to-end service flow test

## Core data model

A `SkillGraph` contains evidence sources and ordered/dependent `SkillNode` records. Nodes carry concepts, procedures, prerequisite relationships, evidence references, and normalized difficulty.

A `LearningEvent` records observable learner evidence including task type, correctness, latency, confidence, assistance use, and timestamp.

A `LearnerState` maintains per-node mastery and attempt counts. The learning engine selects the next eligible node based on prerequisite completion, current mastery, and prior attempts.

A `CompetencyScore` aggregates recall, procedural performance, transfer, error detection, confidence calibration, and assistance dependency.

## Spatial runtime boundary

Cognified does not bind the learning core to one headset vendor. `SpatialRuntimeAdapter` defines the presentation and observation seam so a WebXR, OpenXR, native headset, desktop simulator, or future hardware-specific implementation can connect without changing the learning engine.

## Research boundary

Experimental cognitive interventions must remain separated from the production competency path until they are independently validated. Any future experimental subsystem should record protocol version, consent, assignment, exposure, outcomes, and adverse events without altering competency truth or bypassing ordinary assessment.

## Integrity model

Compiled skill graphs are structurally validated before persistence and can be fingerprinted using SHA-256. Evidence references and prerequisite references are validated for internal consistency. This is the foundation for stronger provenance, signing, and package-distribution controls in later versions.
