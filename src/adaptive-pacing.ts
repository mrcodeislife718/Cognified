/**
 * Closed-loop presentation pacing for E-CSS.
 *
 * Controls visual lesson timing only. It does not control light stimulation,
 * medical devices, neurological exposure, or competency certification.
 * Behavioral performance is the primary adaptation signal; gaze is optional
 * and must never be interpreted as a direct diagnosis of cognitive load.
 */
export type ComfortReport = 'ok' | 'strained' | 'nauseated' | 'stop';

export type PacingFeedback = {
  correct: boolean;
  responseMs: number;
  assistanceUsed: boolean;
};

export type PacingGaze = {
  calibrated: boolean;
  quality: number;
  fixationStable: boolean;
  illuminationStable: boolean;
};

export type PacingSignal = {
  timestampMs: number;
  feedback?: PacingFeedback;
  gaze?: PacingGaze;
  comfort?: ComfortReport;
  resume?: boolean;
};

export type PacingMode = 'running' | 'paused';
export type PacingReason =
  | 'session-started' | 'awaiting-performance' | 'insufficient-evidence'
  | 'stable-performance' | 'increased-pace' | 'reduced-pace'
  | 'tracking-unreliable' | 'attention-uncertain'
  | 'user-strained' | 'user-stopped' | 'user-nauseated'
  | 'paused-until-user-resumes' | 'user-resumed';

export type PacingDecision = {
  sessionId: string;
  mode: PacingMode;
  presentationRate: number;
  reason: PacingReason;
  consecutiveSuccesses: number;
  evidenceMode: 'behavioral' | 'behavioral-and-gaze';
};

export type PacingPolicy = {
  baselineRate: number;
  minimumRate: number;
  maximumRate: number;
  maximumRateWithoutReliableGaze: number;
  increaseStep: number;
  decreaseStep: number;
  successesToIncrease: number;
  minimumChangeIntervalMs: number;
  maxSuccessfulResponseMs: number;
  minimumGazeQuality: number;
};

export const DEFAULT_PACING_POLICY: Readonly<PacingPolicy> = Object.freeze({
  baselineRate: 1,
  minimumRate: 0.6,
  maximumRate: 1.5,
  maximumRateWithoutReliableGaze: 1.2,
  increaseStep: 0.1,
  decreaseStep: 0.2,
  successesToIncrease: 3,
  minimumChangeIntervalMs: 2000,
  maxSuccessfulResponseMs: 8000,
  minimumGazeQuality: 0.7,
});

type Session = {
  mode: PacingMode;
  rate: number;
  successes: number;
  lastTimestampMs: number;
  lastChangedAtMs: number;
  reason: PacingReason;
  evidenceMode: PacingDecision['evidenceMode'];
};

function unit(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(name + ' must be finite and in [0,1]');
  }
}

function validatePolicy(p: PacingPolicy): void {
  for (const name of ['baselineRate', 'minimumRate', 'maximumRate',
    'maximumRateWithoutReliableGaze', 'increaseStep', 'decreaseStep'] as const) {
    if (!Number.isFinite(p[name]) || p[name] <= 0) throw new Error('Invalid pacing policy: ' + name);
  }
  if (!(p.minimumRate <= p.baselineRate &&
    p.baselineRate <= p.maximumRateWithoutReliableGaze &&
    p.maximumRateWithoutReliableGaze <= p.maximumRate)) {
    throw new Error('Pacing rate bounds must be ordered');
  }
  if (!Number.isSafeInteger(p.successesToIncrease) || p.successesToIncrease < 1 ||
    !Number.isFinite(p.minimumChangeIntervalMs) || p.minimumChangeIntervalMs < 0 ||
    !Number.isFinite(p.maxSuccessfulResponseMs) || p.maxSuccessfulResponseMs <= 0) {
    throw new Error('Invalid pacing time or success requirements');
  }
  unit(p.minimumGazeQuality, 'minimumGazeQuality');
}

function validatedSignal(signal: PacingSignal): void {
  if (!Number.isFinite(signal.timestampMs) || signal.timestampMs < 0) throw new Error('Invalid pacing timestamp');
  if (signal.feedback) {
    const f = signal.feedback;
    if (typeof f.correct !== 'boolean' || typeof f.assistanceUsed !== 'boolean' ||
      !Number.isFinite(f.responseMs) || f.responseMs < 0) throw new Error('Invalid behavioral feedback');
  }
  if (signal.gaze) {
    unit(signal.gaze.quality, 'gaze.quality');
    if (typeof signal.gaze.calibrated !== 'boolean' ||
      typeof signal.gaze.fixationStable !== 'boolean' ||
      typeof signal.gaze.illuminationStable !== 'boolean') throw new Error('Invalid gaze flags');
  }
  if (signal.comfort !== undefined &&
    !['ok', 'strained', 'nauseated', 'stop'].includes(signal.comfort)) {
    throw new Error('Invalid comfort report');
  }
  if (signal.resume !== undefined && typeof signal.resume !== 'boolean') throw new Error('Invalid resume flag');
}

export class AdaptivePacingController {
  private readonly sessions = new Map<string, Session>();
  readonly policy: Readonly<PacingPolicy>;

  constructor(policy: PacingPolicy = DEFAULT_PACING_POLICY) {
    validatePolicy(policy);
    this.policy = Object.freeze({ ...policy });
  }

  beginSession(sessionId: string): PacingDecision {
    if (!sessionId.trim()) throw new Error('sessionId is required');
    this.sessions.set(sessionId, {
      mode: 'running',
      rate: this.policy.baselineRate,
      successes: 0,
      lastTimestampMs: -1,
      lastChangedAtMs: -Infinity,
      reason: 'session-started',
      evidenceMode: 'behavioral',
    });
    return this.inspect(sessionId);
  }

  inspect(sessionId: string): PacingDecision {
    const session = this.sessions.get(sessionId);
    if (!session) return this.beginSession(sessionId); // reset safely after server restart
    return this.decision(sessionId, session);
  }

  endSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  step(sessionId: string, signal: PacingSignal): PacingDecision {
    validatedSignal(signal);
    let session = this.sessions.get(sessionId);
    if (!session) {
      this.beginSession(sessionId);
      session = this.sessions.get(sessionId)!;
    }
    if (signal.timestampMs < session.lastTimestampMs) throw new Error('Out-of-order pacing signal');
    session.lastTimestampMs = signal.timestampMs;

    if (signal.comfort === 'nauseated' || signal.comfort === 'stop') {
      session.mode = 'paused';
      session.rate = 0;
      session.successes = 0;
      session.reason = signal.comfort === 'nauseated' ? 'user-nauseated' : 'user-stopped';
      session.lastChangedAtMs = signal.timestampMs;
      return this.decision(sessionId, session);
    }

    if (session.mode === 'paused') {
      if (signal.resume === true && signal.comfort === 'ok') {
        session.mode = 'running';
        session.rate = this.policy.baselineRate;
        session.successes = 0;
        session.reason = 'user-resumed';
        session.lastChangedAtMs = signal.timestampMs;
      } else {
        session.reason = 'paused-until-user-resumes';
      }
      return this.decision(sessionId, session);
    }

    if (signal.comfort === 'strained') {
      session.rate = Math.max(this.policy.minimumRate, session.rate - this.policy.decreaseStep);
      session.successes = 0;
      session.reason = 'user-strained';
      session.lastChangedAtMs = signal.timestampMs;
      return this.decision(sessionId, session);
    }

    const gaze = signal.gaze;
    const gazeReliable = gaze !== undefined &&
      gaze.calibrated && gaze.illuminationStable && gaze.quality >= this.policy.minimumGazeQuality;
    session.evidenceMode = gazeReliable ? 'behavioral-and-gaze' : 'behavioral';

    if (gaze && !gazeReliable) {
      session.rate = Math.min(session.rate, this.policy.baselineRate);
      session.successes = 0;
      session.reason = 'tracking-unreliable';
      session.lastChangedAtMs = signal.timestampMs;
      return this.decision(sessionId, session);
    }

    // Missing sensor readings never grant more aggressive pacing.
    const ceiling = gazeReliable ? this.policy.maximumRate : this.policy.maximumRateWithoutReliableGaze;
    session.rate = Math.min(session.rate, ceiling);

    if (gazeReliable && !gaze!.fixationStable) {
      session.successes = 0;
      session.reason = 'attention-uncertain';
      return this.decision(sessionId, session);
    }

    if (!signal.feedback) {
      session.successes = 0;
      session.reason = 'awaiting-performance';
      return this.decision(sessionId, session);
    }

    const feedback = signal.feedback;
    if (!feedback.correct || feedback.assistanceUsed || feedback.responseMs > this.policy.maxSuccessfulResponseMs) {
      session.rate = Math.max(this.policy.minimumRate, session.rate - this.policy.decreaseStep);
      session.successes = 0;
      session.reason = 'reduced-pace';
      session.lastChangedAtMs = signal.timestampMs;
      return this.decision(sessionId, session);
    }

    session.successes += 1;
    if (session.successes < this.policy.successesToIncrease ||
      signal.timestampMs - session.lastChangedAtMs < this.policy.minimumChangeIntervalMs) {
      session.reason = 'stable-performance';
      return this.decision(sessionId, session);
    }
    const nextRate = Math.min(ceiling, session.rate + this.policy.increaseStep);
    session.successes = 0;
    if (nextRate > session.rate) {
      session.rate = Number(nextRate.toFixed(3));
      session.lastChangedAtMs = signal.timestampMs;
      session.reason = 'increased-pace';
    } else {
      session.reason = 'insufficient-evidence';
    }
    return this.decision(sessionId, session);
  }

  private decision(sessionId: string, s: Session): PacingDecision {
    return {
      sessionId,
      mode: s.mode,
      presentationRate: s.rate,
      reason: s.reason,
      consecutiveSuccesses: s.successes,
      evidenceMode: s.evidenceMode,
    };
  }
}
