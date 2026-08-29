import type { LearnerTwin, PrimitiveLearnerState } from './learner-twin.js';

export type PracticeChallenge = {
  id: string;
  primitiveId: string;
  difficulty: number;
  speedPressure: number;
  complexity: number;
  assistance: number;
  contextNovelty: number;
  distraction: number;
  physicalLoad: number;
  safetyRisk: number;
  prerequisiteIds: string[];
};

export type PracticeDecision = {
  challengeId: string;
  primitiveId: string;
  score: number;
  expectedLearningGain: number;
  challengeGap: number;
  uncertaintyBonus: number;
  safetyPenalty: number;
  fatiguePenalty: number;
};

export type PracticePolicy = {
  maxSafetyRisk: number;
  maxPhysicalLoadWhenFatigued: number;
  explorationWeight: number;
  targetChallengeGap: number;
};

const clamp = (value: number): number => Math.max(0, Math.min(1, value));
const assert01 = (value: number, name: string): number => {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${name} must be between 0 and 1`);
  return value;
};

export class PracticeOptimizer {
  constructor(private readonly policy: PracticePolicy = {
    maxSafetyRisk: 0.35,
    maxPhysicalLoadWhenFatigued: 0.4,
    explorationWeight: 0.12,
    targetChallengeGap: 0.15,
  }) {
    assert01(policy.maxSafetyRisk, 'maxSafetyRisk');
    assert01(policy.maxPhysicalLoadWhenFatigued, 'maxPhysicalLoadWhenFatigued');
    assert01(policy.explorationWeight, 'explorationWeight');
    assert01(policy.targetChallengeGap, 'targetChallengeGap');
  }

  rank(twin: LearnerTwin, challenges: PracticeChallenge[], prerequisiteMastery: Record<string, number> = {}): PracticeDecision[] {
    const ids = new Set<string>();
    const decisions: PracticeDecision[] = [];
    for (const challenge of challenges) {
      if (ids.has(challenge.id)) throw new Error(`Duplicate challenge id: ${challenge.id}`);
      ids.add(challenge.id);
      this.validateChallenge(challenge);
      const state = twin.primitives[challenge.primitiveId];
      if (!state) throw new Error(`Unknown primitive for challenge: ${challenge.primitiveId}`);
      if (!challenge.prerequisiteIds.every((id) => (prerequisiteMastery[id] ?? 0) >= 0.6)) continue;
      if (challenge.safetyRisk > this.policy.maxSafetyRisk) continue;
      if (state.fatigue >= 0.65 && challenge.physicalLoad > this.policy.maxPhysicalLoadWhenFatigued) continue;
      decisions.push(this.score(state, challenge));
    }
    return decisions.sort((a, b) => b.score - a.score || a.challengeId.localeCompare(b.challengeId));
  }

  choose(twin: LearnerTwin, challenges: PracticeChallenge[], prerequisiteMastery: Record<string, number> = {}): PracticeDecision {
    const [best] = this.rank(twin, challenges, prerequisiteMastery);
    if (!best) throw new Error('No safe eligible practice challenge');
    return best;
  }

  private score(state: PrimitiveLearnerState, challenge: PracticeChallenge): PracticeDecision {
    const independence = 1 - state.assistanceDependence;
    const currentCapability = clamp(state.executionAccuracy * 0.4 + state.executionSpeed * 0.15 + independence * 0.15 + state.retention * 0.1 + state.transfer * 0.1 + state.automaticity * 0.1);
    const challengeDemand = clamp(challenge.difficulty * 0.35 + challenge.speedPressure * 0.15 + challenge.complexity * 0.2 + challenge.contextNovelty * 0.15 + challenge.distraction * 0.05 + challenge.physicalLoad * 0.1 - challenge.assistance * 0.2);
    const challengeGap = challengeDemand - currentCapability;
    const gapFitness = clamp(1 - Math.abs(challengeGap - this.policy.targetChallengeGap));
    const weakestDimension = Math.max(
      1 - state.executionAccuracy,
      1 - state.executionSpeed,
      state.assistanceDependence,
      1 - state.retention,
      1 - state.transfer,
      1 - state.automaticity,
    );
    const expectedLearningGain = clamp(gapFitness * 0.55 + weakestDimension * 0.35 + challenge.contextNovelty * (1 - state.transfer) * 0.1);
    const uncertaintyBonus = state.uncertainty * this.policy.explorationWeight;
    const safetyPenalty = challenge.safetyRisk * 0.4;
    const fatiguePenalty = state.fatigue * challenge.physicalLoad * 0.35;
    const score = expectedLearningGain + uncertaintyBonus - safetyPenalty - fatiguePenalty;
    return { challengeId: challenge.id, primitiveId: challenge.primitiveId, score, expectedLearningGain, challengeGap, uncertaintyBonus, safetyPenalty, fatiguePenalty };
  }

  private validateChallenge(challenge: PracticeChallenge): void {
    for (const [name, value] of Object.entries({
      difficulty: challenge.difficulty,
      speedPressure: challenge.speedPressure,
      complexity: challenge.complexity,
      assistance: challenge.assistance,
      contextNovelty: challenge.contextNovelty,
      distraction: challenge.distraction,
      physicalLoad: challenge.physicalLoad,
      safetyRisk: challenge.safetyRisk,
    })) assert01(value, name);
  }
}
