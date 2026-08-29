export type LearningOutcome = {
  id: string;
  learnerId: string;
  skillId: string;
  skillVersion: string;
  strategy: string;
  trainingMinutes: number;
  repetitions: number;
  verifiedCompetency: boolean;
  performance: number;
  delayedRetention: number;
  transfer: number;
  independence: number;
  automaticity: number;
  recordedAt: string;
};

export type LearningOutcomeSummary = {
  strategy: string;
  learners: number;
  verificationRate: number;
  meanTrainingMinutes: number;
  meanRepetitions: number;
  meanPerformance: number;
  meanDelayedRetention: number;
  meanTransfer: number;
  meanIndependence: number;
  meanAutomaticity: number;
};

const bounded = (value: number, name: string): number => {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${name} must be between 0 and 1`);
  return value;
};

export class LearningOutcomeBenchmark {
  private readonly outcomes = new Map<string, LearningOutcome>();

  record(outcome: LearningOutcome): void {
    if (!outcome.id || !outcome.learnerId || !outcome.skillId || !outcome.skillVersion || !outcome.strategy) throw new Error('Learning outcome identity fields are required');
    if (this.outcomes.has(outcome.id)) throw new Error(`Duplicate learning outcome: ${outcome.id}`);
    if (!Number.isFinite(outcome.trainingMinutes) || outcome.trainingMinutes < 0 || !Number.isInteger(outcome.repetitions) || outcome.repetitions < 0) throw new Error('Training time and repetitions must be non-negative');
    for (const [name, value] of Object.entries({ performance: outcome.performance, delayedRetention: outcome.delayedRetention, transfer: outcome.transfer, independence: outcome.independence, automaticity: outcome.automaticity })) bounded(value, name);
    if (!Number.isFinite(Date.parse(outcome.recordedAt))) throw new Error('recordedAt must be a valid timestamp');
    this.outcomes.set(outcome.id, structuredClone(outcome));
  }

  summarize(strategy: string, skillId?: string, skillVersion?: string): LearningOutcomeSummary {
    const records = [...this.outcomes.values()].filter((outcome) => outcome.strategy === strategy && (!skillId || outcome.skillId === skillId) && (!skillVersion || outcome.skillVersion === skillVersion));
    if (!records.length) throw new Error(`No learning outcomes for strategy: ${strategy}`);
    const mean = (selector: (outcome: LearningOutcome) => number): number => records.reduce((sum, outcome) => sum + selector(outcome), 0) / records.length;
    return {
      strategy,
      learners: new Set(records.map((outcome) => outcome.learnerId)).size,
      verificationRate: records.filter((outcome) => outcome.verifiedCompetency).length / records.length,
      meanTrainingMinutes: mean((outcome) => outcome.trainingMinutes),
      meanRepetitions: mean((outcome) => outcome.repetitions),
      meanPerformance: mean((outcome) => outcome.performance),
      meanDelayedRetention: mean((outcome) => outcome.delayedRetention),
      meanTransfer: mean((outcome) => outcome.transfer),
      meanIndependence: mean((outcome) => outcome.independence),
      meanAutomaticity: mean((outcome) => outcome.automaticity),
    };
  }

  compare(candidateStrategy: string, baselineStrategy: string, skillId?: string, skillVersion?: string): Record<string, number> {
    const candidate = this.summarize(candidateStrategy, skillId, skillVersion);
    const baseline = this.summarize(baselineStrategy, skillId, skillVersion);
    return {
      verificationRateDelta: candidate.verificationRate - baseline.verificationRate,
      trainingMinutesDelta: candidate.meanTrainingMinutes - baseline.meanTrainingMinutes,
      repetitionsDelta: candidate.meanRepetitions - baseline.meanRepetitions,
      performanceDelta: candidate.meanPerformance - baseline.meanPerformance,
      delayedRetentionDelta: candidate.meanDelayedRetention - baseline.meanDelayedRetention,
      transferDelta: candidate.meanTransfer - baseline.meanTransfer,
      independenceDelta: candidate.meanIndependence - baseline.meanIndependence,
      automaticityDelta: candidate.meanAutomaticity - baseline.meanAutomaticity,
    };
  }
}
