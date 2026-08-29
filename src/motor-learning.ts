export type MotionSample = {
  tMs: number;
  position: [number, number, number];
  force?: number;
};

export type MotorAttempt = {
  learnerId: string;
  skillId: string;
  nodeId: string;
  samples: MotionSample[];
  sequenceCorrect: boolean;
  completed: boolean;
  assistanceUsed: boolean;
};

export type MotorCompetency = {
  timingConsistency: number;
  pathConsistency: number;
  forceConsistency: number;
  sequenceAccuracy: number;
  independence: number;
  automaticity: number;
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function coefficientOfVariation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (!mean) return 0;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / Math.abs(mean);
}

function pathLength(samples: MotionSample[]): number {
  let total = 0;
  for (let i = 1; i < samples.length; i += 1) {
    const a = samples[i - 1].position;
    const b = samples[i].position;
    total += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  return total;
}

export class MotorLearningEngine {
  score(attempts: MotorAttempt[]): MotorCompetency {
    if (!attempts.length) {
      return { timingConsistency: 0, pathConsistency: 0, forceConsistency: 0, sequenceAccuracy: 0, independence: 0, automaticity: 0 };
    }

    const durations = attempts.map((a) => a.samples.at(-1)?.tMs ?? 0).filter((n) => n > 0);
    const paths = attempts.map((a) => pathLength(a.samples)).filter((n) => n > 0);
    const forces = attempts.flatMap((a) => a.samples.map((s) => s.force).filter((f): f is number => typeof f === 'number'));
    const sequenceAccuracy = attempts.filter((a) => a.sequenceCorrect && a.completed).length / attempts.length;
    const independence = attempts.filter((a) => !a.assistanceUsed).length / attempts.length;
    const timingConsistency = clamp01(1 - coefficientOfVariation(durations));
    const pathConsistency = clamp01(1 - coefficientOfVariation(paths));
    const forceConsistency = forces.length ? clamp01(1 - coefficientOfVariation(forces)) : 1;

    const automaticity = clamp01(
      timingConsistency * 0.2 +
      pathConsistency * 0.2 +
      forceConsistency * 0.1 +
      sequenceAccuracy * 0.3 +
      independence * 0.2,
    );

    return { timingConsistency, pathConsistency, forceConsistency, sequenceAccuracy, independence, automaticity };
  }

  needsMorePractice(score: MotorCompetency, threshold = 0.85): boolean {
    return score.automaticity < threshold;
  }
}
