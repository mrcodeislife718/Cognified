export type ErrorProfile = Record<string, number>;

export type PrimitiveLearnerState = {
  primitiveId: string;
  knowledge: number;
  executionAccuracy: number;
  executionSpeed: number;
  executionVariance: number;
  assistanceDependence: number;
  retention: number;
  transfer: number;
  fatigue: number;
  confidence: number;
  contextSensitivity: number;
  automaticity: number;
  uncertainty: number;
  errorProfile: ErrorProfile;
  observations: number;
  updatedAt: string;
};

export type LearnerTwin = {
  learnerId: string;
  skillId: string;
  skillVersion: string;
  primitives: Record<string, PrimitiveLearnerState>;
  createdAt: string;
  updatedAt: string;
};

export type LearnerObservation = {
  primitiveId: string;
  correctness: number;
  speedScore: number;
  varianceScore: number;
  assistanceUsed: number;
  retentionEvidence?: number;
  transferEvidence?: number;
  fatigueSignal?: number;
  confidence: number;
  contextNovelty?: number;
  automaticityEvidence?: number;
  errorSignals?: string[];
  evidenceReliability: number;
  observedAt: string;
};

const bounded = (value: number, name: string): number => {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${name} must be between 0 and 1`);
  return value;
};
const update = (prior: number, observed: number, reliability: number, alpha: number): number => {
  return Math.max(0, Math.min(1, prior * (1 - alpha * reliability) + observed * alpha * reliability));
};

export class LearnerTwinEngine {
  create(learnerId: string, skillId: string, skillVersion: string, primitiveIds: string[]): LearnerTwin {
    if (!learnerId || !skillId || !skillVersion || !primitiveIds.length) throw new Error('Learner, skill, version, and primitives are required');
    if (new Set(primitiveIds).size !== primitiveIds.length) throw new Error('Duplicate primitive id');
    const now = new Date().toISOString();
    return {
      learnerId,
      skillId,
      skillVersion,
      primitives: Object.fromEntries(primitiveIds.map((primitiveId) => [primitiveId, {
        primitiveId,
        knowledge: 0,
        executionAccuracy: 0,
        executionSpeed: 0,
        executionVariance: 1,
        assistanceDependence: 1,
        retention: 0,
        transfer: 0,
        fatigue: 0,
        confidence: 0.5,
        contextSensitivity: 1,
        automaticity: 0,
        uncertainty: 1,
        errorProfile: {},
        observations: 0,
        updatedAt: now,
      } satisfies PrimitiveLearnerState])),
      createdAt: now,
      updatedAt: now,
    };
  }

  apply(twin: LearnerTwin, observation: LearnerObservation): LearnerTwin {
    const next = structuredClone(twin);
    const state = next.primitives[observation.primitiveId];
    if (!state) throw new Error(`Unknown learner primitive: ${observation.primitiveId}`);
    const correctness = bounded(observation.correctness, 'correctness');
    const speedScore = bounded(observation.speedScore, 'speedScore');
    const varianceScore = bounded(observation.varianceScore, 'varianceScore');
    const assistanceUsed = bounded(observation.assistanceUsed, 'assistanceUsed');
    const confidence = bounded(observation.confidence, 'confidence');
    const reliability = bounded(observation.evidenceReliability, 'evidenceReliability');
    if (!Number.isFinite(Date.parse(observation.observedAt))) throw new Error('observedAt must be a valid timestamp');

    const alpha = Math.min(0.45, 0.18 + state.uncertainty * 0.22);
    state.knowledge = update(state.knowledge, correctness, reliability, alpha);
    state.executionAccuracy = update(state.executionAccuracy, correctness, reliability, alpha);
    state.executionSpeed = update(state.executionSpeed, speedScore, reliability, alpha);
    state.executionVariance = update(state.executionVariance, 1 - varianceScore, reliability, alpha);
    state.assistanceDependence = update(state.assistanceDependence, assistanceUsed, reliability, alpha);
    state.confidence = update(state.confidence, confidence, reliability, alpha);
    if (observation.retentionEvidence !== undefined) state.retention = update(state.retention, bounded(observation.retentionEvidence, 'retentionEvidence'), reliability, alpha);
    if (observation.transferEvidence !== undefined) state.transfer = update(state.transfer, bounded(observation.transferEvidence, 'transferEvidence'), reliability, alpha);
    if (observation.fatigueSignal !== undefined) state.fatigue = update(state.fatigue, bounded(observation.fatigueSignal, 'fatigueSignal'), reliability, alpha);
    if (observation.contextNovelty !== undefined) state.contextSensitivity = update(state.contextSensitivity, 1 - bounded(observation.contextNovelty, 'contextNovelty') * correctness, reliability, alpha);
    if (observation.automaticityEvidence !== undefined) state.automaticity = update(state.automaticity, bounded(observation.automaticityEvidence, 'automaticityEvidence'), reliability, alpha);

    for (const error of observation.errorSignals ?? []) state.errorProfile[error] = (state.errorProfile[error] ?? 0) + 1;
    state.observations += 1;
    state.uncertainty = Math.max(0.05, state.uncertainty * (1 - 0.12 * reliability));
    state.updatedAt = observation.observedAt;
    next.updatedAt = observation.observedAt;
    return next;
  }

  readiness(state: PrimitiveLearnerState): number {
    const independence = 1 - state.assistanceDependence;
    const stability = 1 - state.executionVariance;
    const calibration = 1 - Math.abs(state.confidence - state.executionAccuracy);
    return Math.max(0, Math.min(1,
      state.executionAccuracy * 0.25 + state.executionSpeed * 0.1 + stability * 0.1 + independence * 0.15 +
      state.retention * 0.15 + state.transfer * 0.15 + state.automaticity * 0.05 + calibration * 0.05,
    ));
  }
}
