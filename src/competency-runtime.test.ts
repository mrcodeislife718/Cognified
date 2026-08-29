import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { CognifiedCompetencyRuntime } from './competency-runtime.js';

test('Cognified runtime carries a versioned skill from runtime selection through authoritative evidence to verified transfer', () => {
  const runtime = new CognifiedCompetencyRuntime();
  runtime.registerSkill({
    id: 'skill:assembly', title: 'Assembly skill', version: '1.0.0', sourceEvidenceIds: ['source:1'],
    primitives: [
      { id: 'p1', kind: 'cognitive', title: 'Identify components', description: 'Identify all required components.', prerequisites: [], successCriteria: ['all components correct'], expectedErrorIds: ['e1'] },
      { id: 'p2', kind: 'motor', title: 'Execute assembly', description: 'Execute the validated assembly sequence.', prerequisites: ['p1'], successCriteria: ['sequence within tolerance'], expectedErrorIds: ['e1'] },
    ],
    constraints: [{ id: 'c1', type: 'sequence', description: 'Sequence must remain valid.', hard: true }],
    errorModes: [{ id: 'e1', description: 'Sequence mismatch', severity: 'major', detectableSignals: ['sequence-mismatch'], remediationPrimitiveIds: ['p1','p2'] }],
    contexts: [
      { id: 'ctx:baseline', label: 'Baseline', variables: { environment: 'baseline' } },
      { id: 'ctx:transfer', label: 'Transfer', variables: { environment: 'novel' } },
    ],
    assessments: [{ id: 'assessment:1', primitiveIds: ['p1','p2'], contextIds: ['ctx:baseline','ctx:transfer'], requiresIndependence: true, requiresTransfer: true, requiresDelayedRetention: true }],
  });
  runtime.registerRuntime({ id: 'openxr:1', family: 'openxr', version: '1', capabilities: ['6dof-head','controller-input'], supportedSkillIRVersionRange: '^1', observationSchemaVersion: '1', available: true, measuredLatencyMs: 12 });
  const session = runtime.beginSession('session:1', 'learner:1', 'skill:assembly', '1.0.0', { requiredCapabilities: ['6dof-head','controller-input'], preferredFamilies: ['openxr'] });
  const practice = runtime.choosePractice(session.id, [{ id: 'challenge:1', primitiveId: 'p2', difficulty: 0.3, speedPressure: 0.2, complexity: 0.3, assistance: 0.5, contextNovelty: 0.1, distraction: 0, physicalLoad: 0.1, safetyRisk: 0.05, prerequisiteIds: [] }]);
  assert.equal(practice.challengeId, 'challenge:1');
  runtime.observeLearning(session.id, { primitiveId: 'p2', correctness: 0.9, speedScore: 0.8, varianceScore: 0.9, assistanceUsed: 0.1, confidence: 0.85, retentionEvidence: 0.8, transferEvidence: 0.8, automaticityEvidence: 0.7, evidenceReliability: 0.95, observedAt: '2026-08-29T14:00:00Z' });
  const baseline = runtime.recordCompetencyEvidence(session.id, { primitiveId: 'p2', assessmentId: 'assessment:1', contextId: 'ctx:baseline', evidenceClass: 'behavioral', evidenceArtifactIds: ['artifact:baseline'], metrics: { performance: 0.9 }, observedAt: '2026-08-30T14:00:00Z', protocolVersion: '1', signerId: 'runtime:1' });
  const transfer = runtime.recordCompetencyEvidence(session.id, { primitiveId: 'p2', assessmentId: 'assessment:1', contextId: 'ctx:transfer', evidenceClass: 'behavioral', evidenceArtifactIds: ['artifact:transfer'], metrics: { performance: 0.86 }, observedAt: '2026-08-31T14:00:00Z', protocolVersion: '1', signerId: 'runtime:1' });

  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  runtime.registerEvidenceKey({ keyId: 'key:runtime:1', signerId: 'runtime:1', publicKeyPem, status: 'active', validFrom: '2026-08-01T00:00:00Z' });
  runtime.attestations.signRecord(baseline, 'key:runtime:1', privateKeyPem, '2026-08-30T14:00:01Z');
  runtime.attestations.signRecord(transfer, 'key:runtime:1', privateKeyPem, '2026-08-31T14:00:01Z');

  const scores = { performance: 0.85, retention: 0.8, transfer: 0.8, independence: 0.9, automaticity: 0.7, 'error-recovery': 0.75 } as const;
  const certificate = runtime.verifyCompetency('learner:1', 'skill:assembly', '1.0.0', 'assessment:1', [
    { learnerId: 'learner:1', skillId: 'skill:assembly', skillVersion: '1.0.0', assessmentId: 'assessment:1', contextId: 'ctx:baseline', runtimeId: session.runtimeId, performedAt: '2026-08-30T14:00:00Z', delayedFromTrainingMs: 86_400_000, scores, assistanceUsed: false, evidenceIds: [baseline.id], protocolVersion: '1' },
    { learnerId: 'learner:1', skillId: 'skill:assembly', skillVersion: '1.0.0', assessmentId: 'assessment:1', contextId: 'ctx:transfer', runtimeId: session.runtimeId, performedAt: '2026-08-31T14:00:00Z', delayedFromTrainingMs: 172_800_000, scores, assistanceUsed: false, evidenceIds: [transfer.id], protocolVersion: '1' },
  ], { minimums: { performance: 0.7, retention: 0.7, transfer: 0.7, independence: 0.7, automaticity: 0.6, 'error-recovery': 0.6 }, minimumDistinctContexts: 2, minimumTrials: 2, requireDelayedRetentionMs: 86_400_000 });
  assert.equal(certificate.status, 'verified');
  assert.equal(runtime.evidence.verifyChain(), true);
});
