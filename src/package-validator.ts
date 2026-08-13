import { createHash } from 'node:crypto';
import type { SkillGraph } from './types.js';

export type PackageValidation = {
  valid: boolean;
  errors: string[];
  digest: string;
};

export function digestGraph(graph: SkillGraph): string {
  return createHash('sha256').update(JSON.stringify(graph)).digest('hex');
}

export function validateGraph(graph: SkillGraph): PackageValidation {
  const errors: string[] = [];
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const evidenceIds = new Set(graph.evidence.map((item) => item.id));

  if (!graph.id.trim()) errors.push('graph id is required');
  if (!graph.title.trim()) errors.push('graph title is required');
  if (!graph.nodes.length) errors.push('graph must contain at least one node');

  for (const node of graph.nodes) {
    if (!node.id.trim()) errors.push('node id is required');
    if (!node.title.trim()) errors.push(`node ${node.id} title is required`);
    if (node.difficulty < 0 || node.difficulty > 1) errors.push(`node ${node.id} difficulty must be between 0 and 1`);

    for (const prerequisite of node.prerequisites) {
      if (!nodeIds.has(prerequisite)) errors.push(`node ${node.id} references missing prerequisite ${prerequisite}`);
      if (prerequisite === node.id) errors.push(`node ${node.id} cannot depend on itself`);
    }

    for (const evidenceId of node.evidenceIds) {
      if (!evidenceIds.has(evidenceId)) errors.push(`node ${node.id} references missing evidence ${evidenceId}`);
    }
  }

  for (const evidence of graph.evidence) {
    if (evidence.confidence < 0 || evidence.confidence > 1) errors.push(`evidence ${evidence.id} confidence must be between 0 and 1`);
  }

  return { valid: errors.length === 0, errors, digest: digestGraph(graph) };
}
