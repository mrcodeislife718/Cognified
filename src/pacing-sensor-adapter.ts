import type { FusionWindow } from './sensor-fusion.js';
import type { PacingGaze } from './adaptive-pacing.js';

/**
 * Adapter for calibrated eye-tracking telemetry in Cognified sensor fusion.
 * Observation values are emitted by a vendor-specific OpenXR/desktop adapter.
 * Neither gaze nor pupil data is a direct measurement of learning or overload.
 */
export function gazeFromFusionWindow(
  window: FusionWindow,
  maximumSampleAgeNs = 250_000_000n,
): PacingGaze | undefined {
  if (maximumSampleAgeNs <= 0n) throw new Error('maximumSampleAgeNs must be positive');
  const samples = window.observations
    .filter((observation) => observation.kind === 'eye-tracking')
    .sort((a, b) => a.normalizedTimestampNs < b.normalizedTimestampNs ? -1 : a.normalizedTimestampNs > b.normalizedTimestampNs ? 1 : 0);
  const latest = samples.at(-1);
  if (!latest || latest.normalizedTimestampNs >= window.endNs) return undefined;
  if (window.endNs - latest.normalizedTimestampNs > maximumSampleAgeNs) return undefined;

  const { calibrated, fixationStable, illuminationStable } = latest.values;
  if (typeof calibrated !== 'boolean' ||
    typeof fixationStable !== 'boolean' ||
    typeof illuminationStable !== 'boolean') {
    throw new Error('Eye tracker must report calibration, fixation and illumination quality');
  }
  return {
    calibrated,
    fixationStable,
    illuminationStable,
    quality: latest.quality,
  };
}
