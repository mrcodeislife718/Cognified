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
  const nodeIds = graph.nodes.map((node) => node.id);
  const evidenceIds = graph.evidence.map((item) => item.id);
  const nodeIdSet = new Set(nodeIds);
  const evidenceIdSet = new Set(evidenceIds);

  if (!graph.id.trim()) errors.push('graph id is required');
  if (!graph.title.trim()) errors.push('graph title is required');
  if (!graph.nodes.length) errors.push('graph must contain at least one node');
  if (nodeIdSet.size !== nodeIds.length) errors.push('graph contains duplicate node ids');
  if (evidenceIdSet.size !== evidenceIds.length) errors.push('graph contains duplicate evidence ids');

  for (const node of graph.nodes) {
    if (!node.id.trim()) errors.push('node id is required');
    if (!node.title.trim()) errors.push(`node ${node.id} title is required`);
    if (node.difficulty < 0 || node.difficulty > 1) errors.push(`node ${node.id} difficulty must be between 0 and 1`);
    for (const prerequisite of node.prerequisites) {
      if (!nodeIdSet.has(prerequisite)) errors.push(`node ${node.id} references missing prerequisite ${prerequisite}`);
      if (prerequisite === node.id) errors.push(`node ${node.id} cannot depend on itself`);
    }
    for (const evidenceId of node.evidenceIds) {
      if (!evidenceIdSet.has(evidenceId)) errors.push(`node ${node.id} references missing evidence ${evidenceId}`);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const prerequisite of byId.get(id)?.prerequisites ?? []) {
      if (byId.has(prerequisite) && visit(prerequisite)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  for (const id of nodeIds) {
    if (visit(id)) {
      errors.push('graph prerequisite relationships contain a cycle');
      break;
    }
  }

  for (const evidence of graph.evidence) {
    if (evidence.confidence < 0 || evidence.confidence > 1) errors.push(`evidence ${evidence.id} confidence must be between 0 and 1`);
  }

  return { valid: errors.length === 0, errors, digest: digestGraph(graph) };
}
