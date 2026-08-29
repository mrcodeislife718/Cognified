import test from 'node:test';
import assert from 'node:assert/strict';
import { LearningOutcomeBenchmark } from './outcome-benchmark.js';

test('learning benchmark compares verified competency, retention, and transfer using recorded outcomes', () => {
  const ledger = new LearningOutcomeBenchmark();
  ledger.record({ id: 'a1', learnerId: 'l1', skillId: 's1', skillVersion: '1', strategy: 'adaptive', trainingMinutes: 40, repetitions: 20, verifiedCompetency: true, performance: 0.9, delayedRetention: 0.84, transfer: 0.82, independence: 0.9, automaticity: 0.75, recordedAt: '2026-08-29T14:00:00Z' });
  ledger.record({ id: 'b1', learnerId: 'l2', skillId: 's1', skillVersion: '1', strategy: 'static', trainingMinutes: 60, repetitions: 30, verifiedCompetency: true, performance: 0.82, delayedRetention: 0.7, transfer: 0.68, independence: 0.8, automaticity: 0.62, recordedAt: '2026-08-29T14:00:00Z' });
  const delta = ledger.compare('adaptive', 'static', 's1', '1');
  assert.ok(delta.trainingMinutesDelta < 0);
  assert.ok(delta.delayedRetentionDelta > 0);
  assert.ok(delta.transferDelta > 0);
});
