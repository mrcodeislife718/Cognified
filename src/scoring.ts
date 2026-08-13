import type { CompetencyScore, LearningEvent } from './types.js';

const pct = (value: number) => Math.round(Math.max(0, Math.min(1, value)) * 100);

export class CompetencyScorer {
  score(learnerId: string, skillId: string, events: LearningEvent[]): CompetencyScore {
    const relevant = events.filter((event) => event.learnerId === learnerId && event.skillId === skillId);

    const byKind = (kind: LearningEvent['kind']) => relevant.filter((event) => event.kind === kind);
    const accuracy = (items: LearningEvent[]) => items.length ? items.filter((item) => item.correct).length / items.length : 0;

    const recall = accuracy(byKind('recall'));
    const procedure = accuracy(byKind('procedure'));
    const transfer = accuracy(byKind('transfer'));
    const errorDetection = accuracy(byKind('error-detection'));

    const calibration = relevant.length
      ? relevant.reduce((sum, event) => {
          const target = event.correct ? 1 : 0;
          return sum + (1 - Math.abs(target - event.confidence));
        }, 0) / relevant.length
      : 0;

    const assistanceDependency = relevant.length
      ? relevant.filter((event) => event.assistanceUsed).length / relevant.length
      : 0;

    const components = [recall, procedure, transfer, errorDetection, calibration];
    const overall = components.reduce((sum, value) => sum + value, 0) / components.length * (1 - assistanceDependency * 0.25);

    return {
      learnerId,
      skillId,
      overall: pct(overall),
      recall: pct(recall),
      procedure: pct(procedure),
      transfer: pct(transfer),
      errorDetection: pct(errorDetection),
      confidenceCalibration: pct(calibration),
      assistanceDependency: pct(assistanceDependency),
      evidenceCount: relevant.length,
    };
  }
}
