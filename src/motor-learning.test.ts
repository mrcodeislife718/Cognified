import assert from 'node:assert/strict';
import test from 'node:test';
import { MotorLearningEngine, type MotorAttempt } from './motor-learning.js';

const attempt = (duration: number, assistanceUsed = false): MotorAttempt => ({
  learnerId: 'learner-1',
  skillId: 'skill-1',
  nodeId: 'node-1',
  sequenceCorrect: true,
  completed: true,
  assistanceUsed,
  samples: [
    { tMs: 0, position: [0, 0, 0], force: 2 },
    { tMs: duration / 2, position: [0.5, 0, 0], force: 2.1 },
    { tMs: duration, position: [1, 0, 0], force: 2 },
  ],
});

test('scores repeated consistent independent execution as highly automatic', () => {
  const engine = new MotorLearningEngine();
  const score = engine.score([attempt(1000), attempt(1010), attempt(990)]);
  assert.ok(score.automaticity > 0.9);
  assert.equal(engine.needsMorePractice(score), false);
});

test('assistance lowers independence and automaticity', () => {
  const engine = new MotorLearningEngine();
  const independent = engine.score([attempt(1000), attempt(1000)]);
  const assisted = engine.score([attempt(1000, true), attempt(1000, true)]);
  assert.ok(independent.automaticity > assisted.automaticity);
});
