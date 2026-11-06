import test from 'node:test';
import assert from 'node:assert/strict';
import { AdaptivePacingController, DEFAULT_PACING_POLICY } from './adaptive-pacing.js';

const correct = { correct: true, assistanceUsed: false, responseMs: 1800 };
const inaccurate = { correct: false, assistanceUsed: false, responseMs: 1800 };
const reliableGaze = { calibrated: true, quality: 0.98, fixationStable: true, illuminationStable: true };

test('begins each session at normal presentation pace with no invented neurological claims', () => {
  const engine = new AdaptivePacingController();
  const first = engine.beginSession('first');
  assert.equal(first.mode, 'running');
  assert.equal(first.presentationRate, 1);
  assert.equal(first.reason, 'session-started');
  assert.equal(first.evidenceMode, 'behavioral');
});

test('requires repeated successful independent behavior before a modest speed increase', () => {
  const engine = new AdaptivePacingController();
  engine.beginSession('s1');
  assert.equal(engine.step('s1', { timestampMs: 100, feedback: correct }).presentationRate, 1);
  assert.equal(engine.step('s1', { timestampMs: 1200, feedback: correct }).presentationRate, 1);
  const faster = engine.step('s1', { timestampMs: 2200, feedback: correct });
  assert.equal(faster.presentationRate, 1.1);
  assert.equal(faster.reason, 'increased-pace');
});

test('performance-only operation cannot exceed its lower rate ceiling', () => {
  const engine = new AdaptivePacingController();
  engine.beginSession('s1');
  let final = engine.inspect('s1');
  for (let i = 0; i < 60; i += 1) {
    final = engine.step('s1', { timestampMs: i * 2500, feedback: correct });
  }
  assert.ok(final.presentationRate <= DEFAULT_PACING_POLICY.maximumRateWithoutReliableGaze);
  assert.equal(final.evidenceMode, 'behavioral');
});

test('calibrated stable gaze permits higher ceiling but gaze is never a mastery certificate', () => {
  const engine = new AdaptivePacingController();
  engine.beginSession('s1');
  let final = engine.inspect('s1');
  for (let i = 0; i < 60; i += 1) {
    final = engine.step('s1', { timestampMs: i * 2500, feedback: correct, gaze: reliableGaze });
  }
  assert.equal(final.presentationRate, DEFAULT_PACING_POLICY.maximumRate);
  assert.equal(final.evidenceMode, 'behavioral-and-gaze');
});

test('incorrect, assisted or very slow responses reduce the rate', () => {
  for (const feedback of [inaccurate, { ...correct, assistanceUsed: true }, { ...correct, responseMs: 9000 }]) {
    const engine = new AdaptivePacingController();
    engine.beginSession('s1');
    const decision = engine.step('s1', { timestampMs: 50, feedback });
    assert.equal(decision.presentationRate, 0.8);
    assert.equal(decision.reason, 'reduced-pace');
    assert.equal(decision.consecutiveSuccesses, 0);
  }
});

test('unreliable or uncalibrated gaze prevents escalation and resets to baseline', () => {
  const engine = new AdaptivePacingController();
  engine.beginSession('s1');
  for (let i = 0; i < 12; i += 1) {
    engine.step('s1', { timestampMs: i * 2500, feedback: correct, gaze: reliableGaze });
  }
  assert.ok(engine.inspect('s1').presentationRate > 1);
  const decision = engine.step('s1', {
    timestampMs: 31000, feedback: correct,
    gaze: { ...reliableGaze, calibrated: false },
  });
  assert.equal(decision.presentationRate, 1);
  assert.equal(decision.reason, 'tracking-unreliable');
});

test('a fixation change is uncertainty, not a diagnosis of overload', () => {
  const engine = new AdaptivePacingController();
  const decision = engine.step('s1', {
    timestampMs: 10,
    feedback: correct,
    gaze: { ...reliableGaze, fixationStable: false },
  });
  assert.equal(decision.presentationRate, 1);
  assert.equal(decision.reason, 'attention-uncertain');
});

test('stop or nausea latches pause until the learner explicitly resumes comfortably', () => {
  for (const comfort of ['stop', 'nauseated'] as const) {
    const engine = new AdaptivePacingController();
    engine.beginSession('s1');
    assert.equal(engine.step('s1', { timestampMs: 1, comfort }).presentationRate, 0);
    assert.equal(engine.step('s1', { timestampMs: 2, feedback: correct }).mode, 'paused');
    assert.equal(engine.step('s1', { timestampMs: 3, resume: true }).mode, 'paused');
    const resumed = engine.step('s1', { timestampMs: 4, resume: true, comfort: 'ok' });
    assert.equal(resumed.mode, 'running');
    assert.equal(resumed.presentationRate, 1);
    assert.equal(resumed.reason, 'user-resumed');
  }
});

test('strain always slows immediately; missing performance never accelerates', () => {
  const engine = new AdaptivePacingController();
  engine.beginSession('s1');
  assert.equal(engine.step('s1', { timestampMs: 100, comfort: 'strained' }).presentationRate, 0.8);
  assert.equal(engine.step('s1', { timestampMs: 200 }).presentationRate, 0.8);
});

test('out-of-order and invalid samples are rejected rather than silently reinterpreted', () => {
  const engine = new AdaptivePacingController();
  engine.step('s1', { timestampMs: 100, feedback: correct });
  assert.throws(() => engine.step('s1', { timestampMs: 99, feedback: correct }), /Out-of-order/);
  assert.throws(() => engine.step('s1', { timestampMs: 101, gaze: { ...reliableGaze, quality: Number.NaN } }), /quality/);
  assert.throws(() => engine.step('s1', { timestampMs: 101, feedback: { ...correct, responseMs: -1 } }), /feedback/);
});

test('sessions are isolated and can be explicitly disposed', () => {
  const engine = new AdaptivePacingController();
  engine.beginSession('one');
  engine.beginSession('two');
  engine.step('one', { timestampMs: 1000, comfort: 'stop' });
  assert.equal(engine.inspect('one').mode, 'paused');
  assert.equal(engine.inspect('two').mode, 'running');
  engine.endSession('one');
  assert.equal(engine.inspect('one').presentationRate, 1);
});

test('invalid pacing policy is rejected', () => {
  assert.throws(() => new AdaptivePacingController({ ...DEFAULT_PACING_POLICY, maximumRate: 0.5 }), /bounds/);
  assert.throws(() => new AdaptivePacingController({ ...DEFAULT_PACING_POLICY, successesToIncrease: 0 }), /Invalid/);
});
