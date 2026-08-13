import type { CompetencyScore, LearningEvent, SkillGraph } from './types.js';

const pct = (value: number) => Math.round(Math.max(0, Math.min(1, value)) * 100);

export class CompetencyScorer {
  score(learnerId: string, skillId: string, events: LearningEvent[], graph: SkillGraph): CompetencyScore {
    const relevant = events.filter((event) => event.learnerId === learnerId && event.skillId === skillId);
    const byKind = (kind: LearningEvent['kind']) => relevant.filter((event) => event.kind === kind);
    const accuracy = (items: LearningEvent[]) => items.length ? items.filter((item) => item.correct).length / items.length : 0;

    const recall = accuracy(byKind('recall'));
    const recognition = accuracy(byKind('recognition'));
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

    const nodeAccuracy = new Map<string, number>();
    for (const node of graph.nodes) {
      nodeAccuracy.set(node.id, accuracy(relevant.filter((event) => event.nodeId === node.id)));
    }

    const prerequisiteNodes = graph.nodes.filter((node) => node.prerequisites.length > 0);
    const prerequisiteMastery = prerequisiteNodes.length
      ? prerequisiteNodes.reduce((sum, node) => {
          const prereqScore = node.prerequisites.reduce((inner, id) => inner + (nodeAccuracy.get(id) ?? 0), 0) / node.prerequisites.length;
          return sum + prereqScore;
        }, 0) / prerequisiteNodes.length
      : graph.nodes.length ? graph.nodes.reduce((sum, node) => sum + (nodeAccuracy.get(node.id) ?? 0), 0) / graph.nodes.length : 0;

    const authorityWeight = { primary: 1, secondary: 0.75, user: 0.5 } as const;
    const evidenceStrength = graph.evidence.length
      ? graph.evidence.reduce((sum, item) => sum + item.confidence * authorityWeight[item.authority], 0) / graph.evidence.length
      : 0;

    const firstByNode = new Map<string, number>();
    const delayed: LearningEvent[] = [];
    for (const event of relevant) {
      const time = Date.parse(event.timestamp);
      const first = firstByNode.get(event.nodeId);
      if (first === undefined) {
        firstByNode.set(event.nodeId, time);
      } else if (Number.isFinite(time) && time - first >= 24 * 60 * 60 * 1000) {
        delayed.push(event);
      }
    }
    const retention = delayed.length ? accuracy(delayed) : 0;

    const components = [recall, recognition, procedure, transfer, errorDetection, prerequisiteMastery, calibration];
    const available = components.filter((value) => value > 0);
    const base = available.length ? available.reduce((sum, value) => sum + value, 0) / available.length : 0;
    const overall = base * (0.8 + evidenceStrength * 0.2) * (1 - assistanceDependency * 0.25);

    return {
      learnerId,
      skillId,
      overall: pct(overall),
      recall: pct(recall),
      recognition: pct(recognition),
      procedure: pct(procedure),
      transfer: pct(transfer),
      errorDetection: pct(errorDetection),
      retention: pct(retention),
      prerequisiteMastery: pct(prerequisiteMastery),
      evidenceStrength: pct(evidenceStrength),
      confidenceCalibration: pct(calibration),
      assistanceDependency: pct(assistanceDependency),
      evidenceCount: relevant.length,
    };
  }
}
