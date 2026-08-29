import { createHash, randomUUID } from 'node:crypto';
import type { SensorEvidenceClass } from './sensor-fusion.js';

export type CompetencyEvidenceRecord = {
  id: string;
  learnerId: string;
  skillId: string;
  skillVersion: string;
  primitiveId: string;
  assessmentId?: string;
  contextId: string;
  runtimeId: string;
  evidenceClass: SensorEvidenceClass;
  evidenceArtifactIds: string[];
  metrics: Record<string, number | boolean | string>;
  observedAt: string;
  protocolVersion: string;
  signerId: string;
  previousHash: string;
  hash: string;
};

export type UnsignedCompetencyEvidence = Omit<CompetencyEvidenceRecord, 'id' | 'previousHash' | 'hash'> & { id?: string };

const stable = (value: unknown): string => JSON.stringify(value, Object.keys(value as object).sort());

export class CompetencyEvidenceStore {
  private readonly records: CompetencyEvidenceRecord[] = [];
  private readonly ids = new Set<string>();

  append(input: UnsignedCompetencyEvidence): CompetencyEvidenceRecord {
    if (!input.learnerId || !input.skillId || !input.skillVersion || !input.primitiveId || !input.contextId || !input.runtimeId || !input.protocolVersion || !input.signerId) {
      throw new Error('Competency evidence identity fields are required');
    }
    if (!input.evidenceArtifactIds.length) throw new Error('Competency evidence requires source artifacts');
    if (!Number.isFinite(Date.parse(input.observedAt))) throw new Error('observedAt must be a valid timestamp');
    for (const [name, value] of Object.entries(input.metrics)) {
      if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`Metric ${name} must be finite`);
    }
    const id = input.id ?? randomUUID();
    if (this.ids.has(id)) throw new Error(`Duplicate competency evidence id: ${id}`);
    const previousHash = this.records.at(-1)?.hash ?? 'GENESIS';
    const base = { ...structuredClone(input), id, previousHash };
    const hash = createHash('sha256').update(stable(base)).digest('hex');
    const record: CompetencyEvidenceRecord = { ...base, hash };
    this.records.push(record);
    this.ids.add(id);
    return structuredClone(record);
  }

  query(input: { learnerId?: string; skillId?: string; skillVersion?: string; primitiveId?: string; contextId?: string; evidenceClass?: SensorEvidenceClass }): CompetencyEvidenceRecord[] {
    return this.records
      .filter((record) => !input.learnerId || record.learnerId === input.learnerId)
      .filter((record) => !input.skillId || record.skillId === input.skillId)
      .filter((record) => !input.skillVersion || record.skillVersion === input.skillVersion)
      .filter((record) => !input.primitiveId || record.primitiveId === input.primitiveId)
      .filter((record) => !input.contextId || record.contextId === input.contextId)
      .filter((record) => !input.evidenceClass || record.evidenceClass === input.evidenceClass)
      .map((record) => structuredClone(record));
  }

  verifyChain(): boolean {
    let previousHash = 'GENESIS';
    for (const record of this.records) {
      if (record.previousHash !== previousHash) return false;
      const { hash, ...base } = record;
      if (createHash('sha256').update(stable(base)).digest('hex') !== hash) return false;
      previousHash = hash;
    }
    return true;
  }
}
