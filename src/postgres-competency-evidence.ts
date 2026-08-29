import { createHash, randomUUID } from 'node:crypto';
import { Pool, type PoolConfig } from 'pg';
import type { CompetencyEvidenceRecord, UnsignedCompetencyEvidence } from './competency-evidence.js';

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).filter(([,entry]) => entry !== undefined).sort(([a],[b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`).join(',')}}`;
  return JSON.stringify(value);
};

export class PostgresCompetencyEvidenceStore {
  readonly pool: Pool;
  private readonly ownsPool: boolean;

  constructor(options: { pool?: Pool; connection?: PoolConfig } = {}) {
    if (options.pool) { this.pool = options.pool; this.ownsPool = false; }
    else { this.pool = new Pool(options.connection ?? { connectionString: process.env.DATABASE_URL }); this.ownsPool = true; }
  }

  async close(): Promise<void> { if (this.ownsPool) await this.pool.end(); }

  async append(input: UnsignedCompetencyEvidence): Promise<CompetencyEvidenceRecord> {
    this.validate(input);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      await client.query('LOCK TABLE cognified_competency_evidence IN SHARE ROW EXCLUSIVE MODE');
      const id = input.id ?? randomUUID();
      const duplicate = await client.query('SELECT id FROM cognified_competency_evidence WHERE id=$1', [id]);
      if (duplicate.rowCount) throw new Error(`Duplicate competency evidence id: ${id}`);
      const head = await client.query('SELECT hash FROM cognified_competency_evidence ORDER BY created_at DESC,id DESC LIMIT 1');
      const previousHash = head.rows[0]?.hash ?? 'GENESIS';
      const observedAt = new Date(input.observedAt).toISOString();
      const base = { ...structuredClone(input), id, observedAt, previousHash };
      const hash = createHash('sha256').update(stable(base)).digest('hex');
      await client.query(
        `INSERT INTO cognified_competency_evidence
         (id,learner_id,skill_id,skill_version,primitive_id,assessment_id,context_id,runtime_id,evidence_class,evidence_artifact_ids,metrics,observed_at,protocol_version,signer_id,previous_hash,hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::text[],$11::jsonb,$12,$13,$14,$15,$16)`,
        [id,input.learnerId,input.skillId,input.skillVersion,input.primitiveId,input.assessmentId ?? null,input.contextId,input.runtimeId,input.evidenceClass,input.evidenceArtifactIds,JSON.stringify(input.metrics),observedAt,input.protocolVersion,input.signerId,previousHash,hash],
      );
      await client.query('COMMIT');
      return { ...base, hash };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }

  async query(input: { learnerId?: string; skillId?: string; skillVersion?: string; primitiveId?: string; contextId?: string }): Promise<CompetencyEvidenceRecord[]> {
    const clauses: string[] = [];
    const values: unknown[] = [];
    const add = (sql: string, value: unknown): void => { values.push(value); clauses.push(`${sql} $${values.length}`); };
    if (input.learnerId) add('learner_id =', input.learnerId);
    if (input.skillId) add('skill_id =', input.skillId);
    if (input.skillVersion) add('skill_version =', input.skillVersion);
    if (input.primitiveId) add('primitive_id =', input.primitiveId);
    if (input.contextId) add('context_id =', input.contextId);
    const result = await this.pool.query(`SELECT * FROM cognified_competency_evidence ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY created_at,id`, values);
    return result.rows.map(this.rowToRecord);
  }

  async verifyChain(): Promise<boolean> {
    const result = await this.pool.query('SELECT * FROM cognified_competency_evidence ORDER BY created_at,id');
    let previousHash = 'GENESIS';
    for (const row of result.rows) {
      const record = this.rowToRecord(row);
      if (record.previousHash !== previousHash) return false;
      const { hash, ...base } = record;
      if (createHash('sha256').update(stable(base)).digest('hex') !== hash) return false;
      previousHash = hash;
    }
    return true;
  }

  private validate(input: UnsignedCompetencyEvidence): void {
    if (!input.learnerId || !input.skillId || !input.skillVersion || !input.primitiveId || !input.contextId || !input.runtimeId || !input.protocolVersion || !input.signerId) throw new Error('Competency evidence identity fields are required');
    if (!input.evidenceArtifactIds.length) throw new Error('Competency evidence requires source artifacts');
    if (!Number.isFinite(Date.parse(input.observedAt))) throw new Error('observedAt must be a valid timestamp');
  }

  private rowToRecord = (row: any): CompetencyEvidenceRecord => {
    const base = {
      id: row.id,
      learnerId: row.learner_id,
      skillId: row.skill_id,
      skillVersion: row.skill_version,
      primitiveId: row.primitive_id,
      contextId: row.context_id,
      runtimeId: row.runtime_id,
      evidenceClass: row.evidence_class,
      evidenceArtifactIds: row.evidence_artifact_ids,
      metrics: row.metrics,
      observedAt: new Date(row.observed_at).toISOString(),
      protocolVersion: row.protocol_version,
      signerId: row.signer_id,
      previousHash: row.previous_hash,
      hash: row.hash,
    } satisfies Omit<CompetencyEvidenceRecord,'assessmentId'>;
    return row.assessment_id === null ? base : { ...base, assessmentId: row.assessment_id };
  };
}
