export type SensorEvidenceClass = 'behavioral' | 'physiological' | 'neural';
export type SensorKind = 'xr-controller' | 'hand-tracking' | 'camera-pose' | 'imu' | 'instrumented-tool' | 'haptic' | 'emg' | 'eeg' | 'eye-tracking' | 'manual' | 'other';

export type SensorDescriptor = {
  id: string;
  kind: SensorKind;
  evidenceClass: SensorEvidenceClass;
  clockDomain: string;
  nominalHz: number;
  calibrationId?: string;
};

export type SensorObservation = {
  sensorId: string;
  sequence: bigint;
  timestampNs: bigint;
  receivedAtNs: bigint;
  values: Record<string, number | string | boolean>;
  quality: number;
};

export type NormalizedObservation = SensorObservation & {
  kind: SensorKind;
  evidenceClass: SensorEvidenceClass;
  normalizedTimestampNs: bigint;
  ingestionLatencyNs: bigint;
};

export type FusionWindow = {
  startNs: bigint;
  endNs: bigint;
  observations: NormalizedObservation[];
  droppedBySensor: Record<string, bigint>;
  maxIngestionLatencyNs: bigint;
  evidenceClasses: SensorEvidenceClass[];
};

export class SensorFusionEngine {
  private readonly sensors = new Map<string, SensorDescriptor>();
  private readonly clockOffsetNs = new Map<string, bigint>();
  private readonly lastSequence = new Map<string, bigint>();
  private readonly dropped = new Map<string, bigint>();
  private readonly buffer: NormalizedObservation[] = [];

  register(sensor: SensorDescriptor): void {
    if (!sensor.id.trim() || !sensor.clockDomain.trim() || !Number.isFinite(sensor.nominalHz) || sensor.nominalHz <= 0) throw new Error('Invalid sensor descriptor');
    if ((sensor.evidenceClass === 'physiological' || sensor.evidenceClass === 'neural') && !sensor.calibrationId) {
      throw new Error(`${sensor.evidenceClass} sensors require a calibration record`);
    }
    this.sensors.set(sensor.id, structuredClone(sensor));
  }

  synchronize(clockDomain: string, offsetNs: bigint): void {
    if (!clockDomain.trim()) throw new Error('clockDomain is required');
    this.clockOffsetNs.set(clockDomain, offsetNs);
  }

  ingest(observation: SensorObservation): NormalizedObservation {
    const sensor = this.sensors.get(observation.sensorId);
    if (!sensor) throw new Error(`Unknown sensor: ${observation.sensorId}`);
    if (!Number.isFinite(observation.quality) || observation.quality < 0 || observation.quality > 1) throw new Error('Observation quality must be between 0 and 1');
    if (observation.sequence < 0n || observation.timestampNs < 0n || observation.receivedAtNs < 0n) throw new Error('Sensor sequence and timestamps cannot be negative');
    const prior = this.lastSequence.get(sensor.id);
    if (prior !== undefined) {
      if (observation.sequence <= prior) throw new Error(`Non-monotonic sensor sequence for ${sensor.id}`);
      if (observation.sequence > prior + 1n) this.dropped.set(sensor.id, (this.dropped.get(sensor.id) ?? 0n) + observation.sequence - prior - 1n);
    }
    this.lastSequence.set(sensor.id, observation.sequence);
    const offset = this.clockOffsetNs.get(sensor.clockDomain) ?? 0n;
    const normalizedTimestampNs = observation.timestampNs + offset;
    const ingestionLatencyNs = observation.receivedAtNs >= normalizedTimestampNs ? observation.receivedAtNs - normalizedTimestampNs : 0n;
    const normalized: NormalizedObservation = {
      ...structuredClone(observation),
      kind: sensor.kind,
      evidenceClass: sensor.evidenceClass,
      normalizedTimestampNs,
      ingestionLatencyNs,
    };
    this.buffer.push(normalized);
    return structuredClone(normalized);
  }

  window(startNs: bigint, endNs: bigint): FusionWindow {
    if (startNs < 0n || endNs <= startNs) throw new Error('Invalid fusion window');
    const observations = this.buffer
      .filter((value) => value.normalizedTimestampNs >= startNs && value.normalizedTimestampNs < endNs)
      .sort((a, b) => a.normalizedTimestampNs < b.normalizedTimestampNs ? -1 : a.normalizedTimestampNs > b.normalizedTimestampNs ? 1 : a.sensorId.localeCompare(b.sensorId))
      .map((value) => structuredClone(value));
    const maxIngestionLatencyNs = observations.reduce((max, value) => value.ingestionLatencyNs > max ? value.ingestionLatencyNs : max, 0n);
    return {
      startNs,
      endNs,
      observations,
      droppedBySensor: Object.fromEntries([...this.dropped.entries()]),
      maxIngestionLatencyNs,
      evidenceClasses: [...new Set(observations.map((value) => value.evidenceClass))],
    };
  }

  prune(beforeNs: bigint): number {
    let removed = 0;
    for (let index = this.buffer.length - 1; index >= 0; index -= 1) {
      if (this.buffer[index].normalizedTimestampNs < beforeNs) {
        this.buffer.splice(index, 1);
        removed += 1;
      }
    }
    return removed;
  }
}
