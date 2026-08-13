import type { Experience, LearningEvent } from './types.js';

export type RuntimeObservation = {
  gazeTarget?: string;
  responseMs?: number;
  assistanceUsed?: boolean;
  correct?: boolean;
  confidence?: number;
};

export interface SpatialRuntimeAdapter {
  present(experience: Experience): Promise<void>;
  observe(): Promise<RuntimeObservation>;
  clear(): Promise<void>;
}

export function observationToEvent(input: {
  learnerId: string;
  skillId: string;
  experience: Experience;
  observation: RuntimeObservation;
}): LearningEvent {
  const { learnerId, skillId, experience, observation } = input;
  const kind = experience.mode === 'transfer'
    ? 'transfer'
    : experience.mode === 'retrieve'
      ? 'recall'
      : 'procedure';

  return {
    learnerId,
    skillId,
    nodeId: experience.nodeId,
    kind,
    correct: observation.correct ?? false,
    responseMs: observation.responseMs ?? 0,
    confidence: Math.max(0, Math.min(1, observation.confidence ?? 0)),
    assistanceUsed: observation.assistanceUsed ?? false,
    timestamp: new Date().toISOString(),
  };
}
