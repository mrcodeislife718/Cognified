import test from 'node:test';
import assert from 'node:assert/strict';
import { SensorFusionEngine } from './sensor-fusion.js';
import { gazeFromFusionWindow } from './pacing-sensor-adapter.js';

test('calibrated, current eye observations become optional pacing information', () => {
  const fusion = new SensorFusionEngine();
  fusion.register({ id: 'eye1', kind: 'eye-tracking', evidenceClass: 'physiological',
    clockDomain: 'xr', nominalHz: 120, calibrationId: 'calibration:20261106' });
  fusion.ingest({ sensorId: 'eye1', sequence: 1n, timestampNs: 1_000_000_000n,
    receivedAtNs: 1_000_000_010n, quality: 0.96,
    values: { calibrated: true, fixationStable: true, illuminationStable: true } });
  const result = gazeFromFusionWindow(fusion.window(900_000_000n, 1_100_000_000n));
  assert.deepEqual(result, { calibrated: true, fixationStable: true, illuminationStable: true, quality: 0.96 });
  assert.equal(gazeFromFusionWindow(fusion.window(900_000_000n, 2_000_000_000n)), undefined);
});

test('malformed eye evidence never silently becomes a green-light for acceleration', () => {
  const fusion = new SensorFusionEngine();
  fusion.register({ id: 'eye', kind: 'eye-tracking', evidenceClass: 'behavioral',
    clockDomain: 'xr', nominalHz: 90 });
  fusion.ingest({ sensorId: 'eye', sequence: 1n, timestampNs: 1000n,
    receivedAtNs: 1001n, quality: 0.8, values: { calibrated: 'yes' } });
  assert.throws(() => gazeFromFusionWindow(fusion.window(500n, 1500n)), /Eye tracker/);
  assert.throws(() => gazeFromFusionWindow(fusion.window(500n, 1500n), 0n), /positive/);
});
