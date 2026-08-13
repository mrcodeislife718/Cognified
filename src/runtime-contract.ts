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
  id: string;
  sessionId: string;
  learnerId: string;
  skillId: string;
  experience: Experience;
  observation: RuntimeObservation;
}): LearningEvent {
  const kind = input.experience.mode === 'transfer'
    ? 'transfer'
    : input.experience.mode === 'retrieve'
      ? 'recall'
      : 'procedure';

  return {
    id: input.id,
    sessionId: input.sessionId,
    learnerId: input.learnerId,
    skillId: input.skillId,
    nodeId: input.experience.nodeId,
    kind,
    correct: input.observation.correct ?? false,
    responseMs: input.observation.responseMs ?? 0,
    confidence: Math.max(0, Math.min(1, input.observation.confidence ?? 0)),
    assistanceUsed: input.observation.assistanceUsed ?? false,
    timestamp: new Date().toISOString(),
  };
}
