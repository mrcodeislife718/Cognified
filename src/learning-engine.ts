import { randomUUID } from 'node:crypto';
import type { Experience, LearningEvent, SkillGraph, SkillNode } from './types.js';

export type LearnerState = {
  learnerId: string;
  skillId: string;
  activeSessionId: string;
  sessionStartedAt: string;
  updatedAt: string;
  mastery: Record<string, number>;
  attempts: Record<string, number>;
};

export class LearningEngine {
  createState(learnerId: string, graph: SkillGraph): LearnerState {
    const now = new Date().toISOString();
    return {
      learnerId,
      skillId: graph.id,
      activeSessionId: randomUUID(),
      sessionStartedAt: now,
      updatedAt: now,
      mastery: Object.fromEntries(graph.nodes.map((node) => [node.id, 0])),
      attempts: Object.fromEntries(graph.nodes.map((node) => [node.id, 0])),
    };
  }

  beginSession(state: LearnerState): LearnerState {
    const now = new Date().toISOString();
    return {
      ...structuredClone(state),
      activeSessionId: randomUUID(),
      sessionStartedAt: now,
      updatedAt: now,
    };
  }

  next(graph: SkillGraph, state: LearnerState): Experience | null {
    const eligible = graph.nodes.filter((node) =>
      node.prerequisites.every((id) => (state.mastery[id] ?? 0) >= 0.6),
    );
    if (!eligible.length) return null;

    const node = [...eligible].sort((a, b) => {
      const masteryDelta = (state.mastery[a.id] ?? 0) - (state.mastery[b.id] ?? 0);
      if (masteryDelta !== 0) return masteryDelta;
      return (state.attempts[a.id] ?? 0) - (state.attempts[b.id] ?? 0);
    })[0];

    const mastery = state.mastery[node.id] ?? 0;
    const mode: Experience['mode'] = mastery < 0.2 ? 'explain' : mastery < 0.45 ? 'practice' : mastery < 0.7 ? 'retrieve' : 'transfer';

    return {
      id: `${state.activeSessionId}-${node.id}-${state.attempts[node.id] ?? 0}`,
      nodeId: node.id,
      mode,
      prompt: this.prompt(node, mode),
      objective: `Demonstrate competency in ${node.title}`,
    };
  }

  apply(state: LearnerState, event: LearningEvent): LearnerState {
    const next = structuredClone(state);
    const previous = next.mastery[event.nodeId] ?? 0;
    const latency = Math.max(0.5, Math.min(1, 5000 / Math.max(event.responseMs, 1)));
    const assistance = event.assistanceUsed ? 0.75 : 1;
    const calibration = event.correct
      ? 1 - Math.min(0.25, Math.abs(event.confidence - 1) * 0.25)
      : 1 - Math.min(0.25, event.confidence * 0.25);
    const signal = (event.correct ? 1 : 0) * latency * assistance * calibration;
    const alpha = 0.35;

    next.mastery[event.nodeId] = Math.max(0, Math.min(1, previous * (1 - alpha) + signal * alpha));
    next.attempts[event.nodeId] = (next.attempts[event.nodeId] ?? 0) + 1;
    next.updatedAt = event.timestamp;
    return next;
  }

  private prompt(node: SkillNode, mode: Experience['mode']): string {
    switch (mode) {
      case 'explain': return `Study and summarize: ${node.description}`;
      case 'practice': return `Practice applying: ${node.title}`;
      case 'retrieve': return `Without assistance, explain or perform: ${node.title}`;
      case 'transfer': return `Apply ${node.title} in a new scenario.`;
      default: return node.description;
    }
  }
}
