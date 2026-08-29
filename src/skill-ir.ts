import { createHash } from 'node:crypto';

export type PrimitiveKind = 'cognitive' | 'perceptual' | 'decision' | 'motor';

export type SkillPrimitive = {
  id: string;
  kind: PrimitiveKind;
  title: string;
  description: string;
  prerequisites: string[];
  successCriteria: string[];
  expectedErrorIds: string[];
};

export type SkillConstraint = {
  id: string;
  type: 'safety' | 'sequence' | 'timing' | 'force' | 'environment' | 'tool' | 'other';
  description: string;
  hard: boolean;
};

export type SkillErrorMode = {
  id: string;
  description: string;
  severity: 'minor' | 'major' | 'critical';
  detectableSignals: string[];
  remediationPrimitiveIds: string[];
};

export type SkillContext = {
  id: string;
  label: string;
  variables: Record<string, string | number | boolean>;
};

export type SkillAssessment = {
  id: string;
  primitiveIds: string[];
  contextIds: string[];
  requiresIndependence: boolean;
  requiresTransfer: boolean;
  requiresDelayedRetention: boolean;
  validityMs?: number;
};

export type SkillIR = {
  id: string;
  title: string;
  version: string;
  sourceEvidenceIds: string[];
  primitives: SkillPrimitive[];
  constraints: SkillConstraint[];
  errorModes: SkillErrorMode[];
  contexts: SkillContext[];
  assessments: SkillAssessment[];
  fingerprint: string;
};

export type UnsignedSkillIR = Omit<SkillIR, 'fingerprint'>;

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

export class SkillIRValidator {
  validate(input: UnsignedSkillIR): SkillIR {
    if (!input.id.trim() || !input.title.trim() || !input.version.trim()) throw new Error('Skill id, title, and version are required');
    if (!input.sourceEvidenceIds.length) throw new Error('Skill IR requires source evidence');
    if (!input.primitives.length) throw new Error('Skill IR requires at least one primitive');

    this.unique(input.primitives.map((value) => value.id), 'primitive');
    this.unique(input.constraints.map((value) => value.id), 'constraint');
    this.unique(input.errorModes.map((value) => value.id), 'error mode');
    this.unique(input.contexts.map((value) => value.id), 'context');
    this.unique(input.assessments.map((value) => value.id), 'assessment');

    const primitiveIds = new Set(input.primitives.map((value) => value.id));
    const errorIds = new Set(input.errorModes.map((value) => value.id));
    const contextIds = new Set(input.contexts.map((value) => value.id));
    for (const primitive of input.primitives) {
      if (!primitive.title.trim() || !primitive.description.trim() || !primitive.successCriteria.length) throw new Error(`Primitive ${primitive.id} is incomplete`);
      for (const prerequisite of primitive.prerequisites) if (!primitiveIds.has(prerequisite)) throw new Error(`Unknown prerequisite ${prerequisite}`);
      for (const errorId of primitive.expectedErrorIds) if (!errorIds.has(errorId)) throw new Error(`Unknown expected error ${errorId}`);
    }
    this.assertAcyclic(input.primitives);
    for (const error of input.errorModes) {
      for (const primitiveId of error.remediationPrimitiveIds) if (!primitiveIds.has(primitiveId)) throw new Error(`Unknown remediation primitive ${primitiveId}`);
    }
    for (const assessment of input.assessments) {
      if (!assessment.primitiveIds.length) throw new Error(`Assessment ${assessment.id} has no primitives`);
      for (const primitiveId of assessment.primitiveIds) if (!primitiveIds.has(primitiveId)) throw new Error(`Unknown assessment primitive ${primitiveId}`);
      for (const contextId of assessment.contextIds) if (!contextIds.has(contextId)) throw new Error(`Unknown assessment context ${contextId}`);
      if (assessment.validityMs !== undefined && assessment.validityMs <= 0) throw new Error('Assessment validityMs must be positive');
    }

    const canonical = structuredClone(input);
    const fingerprint = createHash('sha256').update(stableStringify(canonical)).digest('hex');
    return { ...canonical, fingerprint };
  }

  private unique(ids: string[], label: string): void {
    if (ids.some((id) => !id.trim())) throw new Error(`${label} ids must be non-empty`);
    if (new Set(ids).size !== ids.length) throw new Error(`Duplicate ${label} id`);
  }

  private assertAcyclic(primitives: SkillPrimitive[]): void {
    const graph = new Map(primitives.map((value) => [value.id, value.prerequisites]));
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (id: string): void => {
      if (visiting.has(id)) throw new Error(`Skill primitive dependency cycle detected at ${id}`);
      if (visited.has(id)) return;
      visiting.add(id);
      for (const dependency of graph.get(id) ?? []) visit(dependency);
      visiting.delete(id);
      visited.add(id);
    };
    for (const id of graph.keys()) visit(id);
  }
}
