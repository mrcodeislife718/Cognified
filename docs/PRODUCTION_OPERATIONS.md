# Cognified Production Operations

## Source of competency truth

Observed competency evidence is authoritative. Learner Twin state, AI recommendations, generated lessons, and model predictions are derived state and may never directly certify a skill.

## Database migration

Apply `migrations/001_competency_evidence.sql` before enabling durable evidence writes. Evidence records are append-only. Schema migrations must preserve learner ID, skill/version, primitive, context, runtime, protocol, signer, artifacts, metrics, timestamps, and hash-chain fields.

## Evidence ingestion

Normalize timestamps before hashing. Require calibrated sensor identities for physiological and neural evidence. Preserve behavioral, physiological, and neural classes separately. Sensor sequence regressions are rejected; missing sequences are counted as dropped observations.

## Recovery

1. Restore the evidence database to an isolated environment.
2. Verify the competency evidence hash chain.
3. Recompute certificates from persisted evidence rather than restoring cached certificates blindly.
4. Rebuild Learner Twin state as derived state where necessary.
5. Reject certification if required artifacts or protocol versions cannot be reconstructed.

## Required production metrics

- evidence append latency
- sensor ingestion p50/p95/p99 latency
- clock synchronization error
- dropped sample counts by device
- calibration age and failures
- learner-state prediction calibration
- practice-plan safety rejection rate
- time to verified competency
- delayed retention
- novel-context transfer
- independence and assistance dependency
- certificate insufficient-evidence rate
- runtime compatibility failures

## Device and runtime degradation

A runtime may be removed from service independently. Skill semantics remain in the Skill IR; a failed headset/device vendor must not invalidate the skill definition. When required capabilities cannot be supplied by any available runtime, execution is rejected rather than silently degrading assessment semantics.

## Certification integrity

A competency certificate is bound to learner, skill ID, skill version, assessment, protocol version, contexts, evidence artifacts, and validity interval. A new skill or assessment version does not silently inherit previous certification.

## Scaling

At 1x, sensor preprocessing and learner state can remain local to a session. At 10x, device fleet telemetry, cohort analytics, and inference workloads must be separated from evidence truth. At 100x, high-rate sensor preprocessing moves to edge runtimes while normalized evidence is written regionally and aggregated only through privacy-preserving derived analytics.

## Privacy and security

Collect the minimum sensor data required for the skill and assessment. Physiological and neural streams require explicit purpose limitation and should not be treated as general profiling data. Secrets and signing material must remain outside source control. Access to raw learner evidence should be narrower than access to derived training recommendations.

## Backup and restore proof

A release is operationally qualified only after restoring the evidence database into an isolated environment, verifying the chain, reconstructing a sample of learner evidence queries, and regenerating competency verification from restored evidence.
