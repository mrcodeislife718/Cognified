import { createHash, randomUUID } from 'node:crypto';

export type CompetencyDimension = 'performance' | 'retention' | 'transfer' | 'independence' | 'automaticity' | 'error-recovery';

export type CompetencyTrial = {
  id?: string;
  learnerId: string;
  skillId: string;
  skillVersion: string;
  assessmentId: string;
  contextId: string;
  runtimeId: string;
  performedAt: string;
  delayedFromTrainingMs?: number;
  scores: Partial<Record<CompetencyDimension, number>>;
  assistanceUsed: boolean;
  evidenceIds: string[];
  protocolVersion: string;
};

export type CompetencyCertificate = {
  id: string;
  learnerId: string;
  skillId: string;
  skillVersion: string;
  assessmentId: string;
  status: 'insufficient-evidence' | 'verified';
  dimensions: Record<CompetencyDimension, number>;
  contextIds: string[];
  evidenceIds: string[];
  protocolVersion: string;
  issuedAt: string;
  validUntil?: string;
  fingerprint: string;
};

export type VerificationPolicy = {
  minimums: Record<CompetencyDimension, number>;
  minimumDistinctContexts: number;
  minimumTrials: number;
  requireDelayedRetentionMs: number;
  validityMs?: number;
};

const dimensions: CompetencyDimension[] = ['performance', 'retention', 'transfer', 'independence', 'automaticity', 'error-recovery'];
const bounded = (value: number, name: string): number => {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${name} must be between 0 and 1`);
  return value;
};

export class TransferVerificationEngine {
  verify(trials: CompetencyTrial[], policy: VerificationPolicy): CompetencyCertificate {
    if (!trials.length) throw new Error('At least one competency trial is required');
    for (const dimension of dimensions) bounded(policy.minimums[dimension], `minimum ${dimension}`);
    if (policy.minimumDistinctContexts < 1 || policy.minimumTrials < 1 || policy.requireDelayedRetentionMs < 0) throw new Error('Invalid verification policy');

    const normalized = trials.map((trial) => this.validateTrial(trial));
    const first = normalized[0];
    for (const trial of normalized) {
      if (trial.learnerId !== first.learnerId || trial.skillId !== first.skillId || trial.skillVersion !== first.skillVersion || trial.assessmentId !== first.assessmentId || trial.protocolVersion !== first.protocolVersion) {
        throw new Error('Competency trials must refer to the same learner, versioned skill, assessment, and protocol');
      }
    }

    const dimensionValues = Object.fromEntries(dimensions.map((dimension) => {
      const values = normalized.flatMap((trial) => trial.scores[dimension] === undefined ? [] : [trial.scores[dimension]!]);
      const value = values.length ? values.reduce((sum, score) => sum + score, 0) / values.length : 0;
      return [dimension, value];
    })) as Record<CompetencyDimension, number>;

    const contexts = [...new Set(normalized.map((trial) => trial.contextId))];
    const delayedRetentionSatisfied = normalized.some((trial) => (trial.delayedFromTrainingMs ?? 0) >= policy.requireDelayedRetentionMs && trial.scores.retention !== undefined);
    const independentSatisfied = normalized.some((trial) => !trial.assistanceUsed && (trial.scores.independence ?? 0) >= policy.minimums.independence);
    const dimensionsSatisfied = dimensions.every((dimension) => dimensionValues[dimension] >= policy.minimums[dimension]);
    const status: CompetencyCertificate['status'] =
      normalized.length >= policy.minimumTrials &&
      contexts.length >= policy.minimumDistinctContexts &&
      delayedRetentionSatisfied &&
      independentSatisfied &&
      dimensionsSatisfied
        ? 'verified'
        : 'insufficient-evidence';

    const issuedAt = new Date().toISOString();
    const evidenceIds = [...new Set(normalized.flatMap((trial) => trial.evidenceIds))].sort();
    const canonical = {
      learnerId: first.learnerId,
      skillId: first.skillId,
      skillVersion: first.skillVersion,
      assessmentId: first.assessmentId,
      status,
      dimensions: dimensionValues,
      contextIds: contexts.sort(),
      evidenceIds,
      protocolVersion: first.protocolVersion,
      issuedAt,
      validUntil: policy.validityMs ? new Date(Date.parse(issuedAt) + policy.validityMs).toISOString() : undefined,
    };
    const fingerprint = createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
    return { id: randomUUID(), ...canonical, fingerprint };
  }

  private validateTrial(trial: CompetencyTrial): CompetencyTrial & { id: string } {
    if (!trial.learnerId || !trial.skillId || !trial.skillVersion || !trial.assessmentId || !trial.contextId || !trial.runtimeId || !trial.protocolVersion) throw new Error('Competency trial identity fields are required');
    if (!Number.isFinite(Date.parse(trial.performedAt))) throw new Error('performedAt must be a valid timestamp');
    if (!trial.evidenceIds.length) throw new Error('Competency trials require evidence');
    for (const [dimension, value] of Object.entries(trial.scores)) bounded(value!, dimension);
    if (trial.delayedFromTrainingMs !== undefined && trial.delayedFromTrainingMs < 0) throw new Error('delayedFromTrainingMs cannot be negative');
    return { ...structuredClone(trial), id: trial.id ?? randomUUID() };
  }
}
