import test from 'node:test';
import assert from 'node:assert/strict';
import { SkillIRValidator } from './skill-ir.js';
import { LearnerTwinEngine } from './learner-twin.js';
import { PracticeOptimizer } from './practice-optimizer.js';
import { SensorFusionEngine } from './sensor-fusion.js';
import { TransferVerificationEngine } from './transfer-verifier.js';
import { RuntimeRegistry } from './runtime-registry.js';
import { CompetencyEvidenceStore } from './competency-evidence.js';

test('Skill IR validates runtime-independent skill semantics and rejects dependency cycles', () => {
  const validator = new SkillIRValidator();
  const skill = validator.validate({
    id: 'skill:assembly', title: 'Assembly skill', version: '1.0.0', sourceEvidenceIds: ['source:1'],
    primitives: [
      { id: 'p1', kind: 'cognitive', title: 'Identify components', description: 'Identify the required components.', prerequisites: [], successCriteria: ['all components correctly identified'], expectedErrorIds: ['e1'] },
      { id: 'p2', kind: 'motor', title: 'Assemble sequence', description: 'Execute the validated assembly sequence.', prerequisites: ['p1'], successCriteria: ['sequence completed within tolerance'], expectedErrorIds: ['e1'] },
    ],
    constraints: [{ id: 'c1', type: 'sequence', description: 'Required order is preserved.', hard: true }],
    errorModes: [{ id: 'e1', description: 'Incorrect order', severity: 'major', detectableSignals: ['sequence-mismatch'], remediationPrimitiveIds: ['p1', 'p2'] }],
    contexts: [{ id: 'ctx:base', label: 'baseline', variables: { environment: 'baseline' } }],
    assessments: [{ id: 'a1', primitiveIds: ['p1', 'p2'], contextIds: ['ctx:base'], requiresIndependence: true, requiresTransfer: true, requiresDelayedRetention: true }],
  });
  assert.equal(skill.fingerprint.length, 64);
  assert.throws(() => validator.validate({ ...skill, primitives: [
    { ...skill.primitives[0], prerequisites: ['p2'] },
    { ...skill.primitives[1], prerequisites: ['p1'] },
  ] }));
});

test('Learner Twin remains a prediction and updates uncertainty from reliable observations', () => {
  const engine = new LearnerTwinEngine();
  const twin = engine.create('learner:1', 'skill:1', '1.0.0', ['p1']);
  const updated = engine.apply(twin, {
    primitiveId: 'p1', correctness: 0.9, speedScore: 0.8, varianceScore: 0.9, assistanceUsed: 0.1,
    retentionEvidence: 0.75, transferEvidence: 0.7, fatigueSignal: 0.1, confidence: 0.8, contextNovelty: 0.8,
    automaticityEvidence: 0.65, errorSignals: [], evidenceReliability: 0.95, observedAt: new Date().toISOString(),
  });
  assert.ok(updated.primitives.p1.uncertainty < twin.primitives.p1.uncertainty);
  assert.ok(engine.readiness(updated.primitives.p1) > 0);
});

test('practice optimizer excludes unsafe/fatiguing challenges and chooses eligible challenge point', () => {
  const twinEngine = new LearnerTwinEngine();
  let twin = twinEngine.create('learner:1', 'skill:1', '1.0.0', ['p1']);
  twin = twinEngine.apply(twin, { primitiveId: 'p1', correctness: 0.6, speedScore: 0.5, varianceScore: 0.6, assistanceUsed: 0.4, confidence: 0.6, evidenceReliability: 1, observedAt: new Date().toISOString() });
  const optimizer = new PracticeOptimizer();
  const selected = optimizer.choose(twin, [
    { id: 'safe', primitiveId: 'p1', difficulty: 0.65, speedPressure: 0.5, complexity: 0.5, assistance: 0.2, contextNovelty: 0.3, distraction: 0.1, physicalLoad: 0.2, safetyRisk: 0.1, prerequisiteIds: [] },
    { id: 'unsafe', primitiveId: 'p1', difficulty: 0.9, speedPressure: 1, complexity: 1, assistance: 0, contextNovelty: 1, distraction: 1, physicalLoad: 1, safetyRisk: 0.9, prerequisiteIds: [] },
  ]);
  assert.equal(selected.challengeId, 'safe');
});

test('sensor fusion preserves behavioral/physiological/neural evidence classes and detects dropped samples', () => {
  const fusion = new SensorFusionEngine();
  fusion.register({ id: 'controller', kind: 'xr-controller', evidenceClass: 'behavioral', clockDomain: 'xr', nominalHz: 90 });
  fusion.register({ id: 'emg', kind: 'emg', evidenceClass: 'physiological', clockDomain: 'bio', nominalHz: 250, calibrationId: 'cal:1' });
  fusion.synchronize('xr', 0n);
  fusion.synchronize('bio', 100n);
  fusion.ingest({ sensorId: 'controller', sequence: 1n, timestampNs: 1000n, receivedAtNs: 1100n, values: { x: 1 }, quality: 1 });
  fusion.ingest({ sensorId: 'controller', sequence: 3n, timestampNs: 1200n, receivedAtNs: 1300n, values: { x: 2 }, quality: 1 });
  fusion.ingest({ sensorId: 'emg', sequence: 1n, timestampNs: 1000n, receivedAtNs: 1200n, values: { amplitude: 0.2 }, quality: 0.9 });
  const window = fusion.window(900n, 1500n);
  assert.deepEqual(new Set(window.evidenceClasses), new Set(['behavioral', 'physiological']));
  assert.equal(window.droppedBySensor.controller, 1n);
});

test('transfer verifier requires performance, delayed retention, independence, and multiple contexts', () => {
  const verifier = new TransferVerificationEngine();
  const base = { learnerId: 'l1', skillId: 's1', skillVersion: '1.0.0', assessmentId: 'a1', runtimeId: 'runtime', performedAt: new Date().toISOString(), assistanceUsed: false, evidenceIds: ['ev1'], protocolVersion: '1.0.0' };
  const policy = { minimums: { performance: 0.7, retention: 0.7, transfer: 0.7, independence: 0.7, automaticity: 0.6, 'error-recovery': 0.6 }, minimumDistinctContexts: 2, minimumTrials: 2, requireDelayedRetentionMs: 86_400_000 };
  const certificate = verifier.verify([
    { ...base, contextId: 'ctx1', scores: { performance: 0.85, retention: 0.8, transfer: 0.75, independence: 0.9, automaticity: 0.7, 'error-recovery': 0.75 }, delayedFromTrainingMs: 86_400_000 },
    { ...base, contextId: 'ctx2', evidenceIds: ['ev2'], scores: { performance: 0.8, retention: 0.75, transfer: 0.8, independence: 0.85, automaticity: 0.65, 'error-recovery': 0.7 }, delayedFromTrainingMs: 172_800_000 },
  ], policy);
  assert.equal(certificate.status, 'verified');
});

test('runtime registry chooses by capabilities instead of vendor', () => {
  const registry = new RuntimeRegistry();
  registry.register({ id: 'web', family: 'webxr', version: '1', capabilities: ['6dof-head', 'controller-input'], supportedSkillIRVersionRange: '^1', observationSchemaVersion: '1', available: true, measuredLatencyMs: 30 });
  registry.register({ id: 'native', family: 'openxr', version: '1', capabilities: ['6dof-head', 'controller-input', 'haptics'], supportedSkillIRVersionRange: '^1', observationSchemaVersion: '1', available: true, measuredLatencyMs: 15 });
  assert.equal(registry.requireCompatible({ requiredCapabilities: ['6dof-head', 'controller-input'], preferredFamilies: ['openxr', 'webxr'] }).id, 'native');
});

test('competency evidence store is append-only and verifiable', () => {
  const store = new CompetencyEvidenceStore();
  store.append({ learnerId: 'l1', skillId: 's1', skillVersion: '1', primitiveId: 'p1', contextId: 'ctx', runtimeId: 'runtime', evidenceClass: 'behavioral', evidenceArtifactIds: ['artifact:1'], metrics: { accuracy: 0.9 }, observedAt: new Date().toISOString(), protocolVersion: '1', signerId: 'runtime:1' });
  store.append({ learnerId: 'l1', skillId: 's1', skillVersion: '1', primitiveId: 'p1', contextId: 'ctx2', runtimeId: 'runtime', evidenceClass: 'behavioral', evidenceArtifactIds: ['artifact:2'], metrics: { accuracy: 0.85 }, observedAt: new Date().toISOString(), protocolVersion: '1', signerId: 'runtime:1' });
  assert.equal(store.verifyChain(), true);
  assert.equal(store.query({ learnerId: 'l1', skillId: 's1' }).length, 2);
});
