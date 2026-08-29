import { createPublicKey, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { SkillIRValidator, type SkillIR, type UnsignedSkillIR } from './skill-ir.js';
import type { LearnerTwin } from './learner-twin.js';
import type { RuntimeDescriptor } from './runtime-registry.js';
import type { LearnerSession } from './competency-runtime.js';
import type { TrustedEvidenceKey, EvidenceAttestation } from './evidence-attestation.js';
import type { PracticeDecision } from './practice-optimizer.js';
import type { CompetencyCertificate } from './transfer-verifier.js';

export type VersionedTwin = { twin: LearnerTwin; revision: bigint };

export class PostgresRuntimeStateStore {
  private readonly skillValidator = new SkillIRValidator();
  constructor(readonly pool: Pool) {}

  async registerSkill(input: UnsignedSkillIR): Promise<SkillIR> {
    const skill = this.skillValidator.validate(input);
    const existing = await this.pool.query('SELECT fingerprint,payload FROM cognified_skills WHERE skill_id=$1 AND skill_version=$2', [skill.id,skill.version]);
    if (existing.rowCount) {
      if (existing.rows[0].fingerprint !== skill.fingerprint) throw new Error(`Skill version ${skill.id}@${skill.version} is immutable once registered`);
      return existing.rows[0].payload as SkillIR;
    }
    await this.pool.query(
      `INSERT INTO cognified_skills (skill_id,skill_version,title,fingerprint,payload) VALUES ($1,$2,$3,$4,$5::jsonb)`,
      [skill.id,skill.version,skill.title,skill.fingerprint,JSON.stringify(skill)],
    );
    return structuredClone(skill);
  }

  async requireSkill(skillId: string, skillVersion: string): Promise<SkillIR> {
    const result = await this.pool.query('SELECT payload FROM cognified_skills WHERE skill_id=$1 AND skill_version=$2', [skillId,skillVersion]);
    if (!result.rowCount) throw new Error(`Unknown versioned skill: ${skillId}@${skillVersion}`);
    return result.rows[0].payload as SkillIR;
  }

  async registerRuntime(runtime: RuntimeDescriptor): Promise<RuntimeDescriptor> {
    this.validateRuntime(runtime);
    const result = await this.pool.query(
      `INSERT INTO cognified_runtime_descriptors
       (runtime_id,family,runtime_version,capabilities,supported_skill_ir_version_range,observation_schema_version,available,measured_latency_ms,updated_at)
       VALUES ($1,$2,$3,$4::text[],$5,$6,$7,$8,now())
       ON CONFLICT (runtime_id) DO UPDATE SET family=EXCLUDED.family,runtime_version=EXCLUDED.runtime_version,
       capabilities=EXCLUDED.capabilities,supported_skill_ir_version_range=EXCLUDED.supported_skill_ir_version_range,
       observation_schema_version=EXCLUDED.observation_schema_version,available=EXCLUDED.available,
       measured_latency_ms=EXCLUDED.measured_latency_ms,updated_at=now()
       RETURNING *`,
      [runtime.id,runtime.family,runtime.version,runtime.capabilities,runtime.supportedSkillIRVersionRange,runtime.observationSchemaVersion,runtime.available,runtime.measuredLatencyMs ?? null],
    );
    return this.rowToRuntime(result.rows[0]);
  }

  async setRuntimeAvailability(runtimeId: string, available: boolean): Promise<RuntimeDescriptor> {
    const result = await this.pool.query('UPDATE cognified_runtime_descriptors SET available=$2,updated_at=now() WHERE runtime_id=$1 RETURNING *', [runtimeId,available]);
    if (!result.rowCount) throw new Error(`Unknown runtime: ${runtimeId}`);
    return this.rowToRuntime(result.rows[0]);
  }

  async listRuntimes(): Promise<RuntimeDescriptor[]> {
    const result = await this.pool.query('SELECT * FROM cognified_runtime_descriptors ORDER BY runtime_id');
    return result.rows.map((row) => this.rowToRuntime(row));
  }

  async createTwin(twin: LearnerTwin): Promise<VersionedTwin> {
    const result = await this.pool.query(
      `INSERT INTO cognified_learner_twins
       (learner_id,skill_id,skill_version,revision,state,created_at,updated_at)
       VALUES ($1,$2,$3,1,$4::jsonb,$5,$6)
       ON CONFLICT (learner_id,skill_id,skill_version) DO NOTHING RETURNING revision,state`,
      [twin.learnerId,twin.skillId,twin.skillVersion,JSON.stringify(twin),new Date(twin.createdAt).toISOString(),new Date(twin.updatedAt).toISOString()],
    );
    if (result.rowCount) return { twin: result.rows[0].state as LearnerTwin, revision: BigInt(result.rows[0].revision) };
    return this.requireTwin(twin.learnerId,twin.skillId,twin.skillVersion);
  }

  async requireTwin(learnerId: string, skillId: string, skillVersion: string): Promise<VersionedTwin> {
    const result = await this.pool.query(
      'SELECT revision,state FROM cognified_learner_twins WHERE learner_id=$1 AND skill_id=$2 AND skill_version=$3',
      [learnerId,skillId,skillVersion],
    );
    if (!result.rowCount) throw new Error('Learner Twin has not been initialized');
    return { twin: result.rows[0].state as LearnerTwin, revision: BigInt(result.rows[0].revision) };
  }

  async updateTwin(twin: LearnerTwin, expectedRevision: bigint): Promise<VersionedTwin> {
    const result = await this.pool.query(
      `UPDATE cognified_learner_twins SET state=$5::jsonb,revision=revision+1,updated_at=$6
       WHERE learner_id=$1 AND skill_id=$2 AND skill_version=$3 AND revision=$4::bigint
       RETURNING revision,state`,
      [twin.learnerId,twin.skillId,twin.skillVersion,expectedRevision.toString(),JSON.stringify(twin),new Date(twin.updatedAt).toISOString()],
    );
    if (!result.rowCount) throw new Error('Learner Twin revision conflict');
    return { twin: result.rows[0].state as LearnerTwin, revision: BigInt(result.rows[0].revision) };
  }

  async createSession(session: LearnerSession): Promise<LearnerSession> {
    const result = await this.pool.query(
      `INSERT INTO cognified_sessions
       (session_id,learner_id,skill_id,skill_version,runtime_id,status,started_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [session.id,session.learnerId,session.skillId,session.skillVersion,session.runtimeId,session.status,new Date(session.startedAt).toISOString()],
    );
    return this.rowToSession(result.rows[0]);
  }

  async requireSession(sessionId: string): Promise<LearnerSession> {
    const result = await this.pool.query('SELECT * FROM cognified_sessions WHERE session_id=$1', [sessionId]);
    if (!result.rowCount) throw new Error(`Unknown session: ${sessionId}`);
    return this.rowToSession(result.rows[0]);
  }

  async finishSession(sessionId: string, status: 'completed'|'cancelled'): Promise<LearnerSession> {
    const result = await this.pool.query(
      `UPDATE cognified_sessions SET status=$2,ended_at=now() WHERE session_id=$1 AND status='active' RETURNING *`, [sessionId,status],
    );
    if (!result.rowCount) throw new Error('Session is missing or not active');
    return this.rowToSession(result.rows[0]);
  }

  async registerEvidenceKey(key: TrustedEvidenceKey): Promise<TrustedEvidenceKey> {
    this.validateKey(key);
    const existing = await this.pool.query('SELECT * FROM cognified_evidence_keys WHERE key_id=$1', [key.keyId]);
    if (existing.rowCount) {
      const current = this.rowToKey(existing.rows[0]);
      if (current.signerId !== key.signerId || current.publicKeyPem !== key.publicKeyPem) throw new Error(`Key id is already bound to another identity: ${key.keyId}`);
      return current;
    }
    const result = await this.pool.query(
      `INSERT INTO cognified_evidence_keys (key_id,signer_id,public_key_pem,status,valid_from,valid_until)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [key.keyId,key.signerId,key.publicKeyPem,key.status,new Date(key.validFrom).toISOString(),key.validUntil ? new Date(key.validUntil).toISOString() : null],
    );
    return this.rowToKey(result.rows[0]);
  }

  async revokeEvidenceKey(keyId: string): Promise<TrustedEvidenceKey> {
    const result = await this.pool.query(`UPDATE cognified_evidence_keys SET status='revoked' WHERE key_id=$1 RETURNING *`, [keyId]);
    if (!result.rowCount) throw new Error(`Unknown evidence key: ${keyId}`);
    return this.rowToKey(result.rows[0]);
  }

  async listEvidenceKeys(): Promise<TrustedEvidenceKey[]> {
    const result = await this.pool.query('SELECT * FROM cognified_evidence_keys ORDER BY key_id');
    return result.rows.map((row) => this.rowToKey(row));
  }

  async persistAttestation(attestation: EvidenceAttestation): Promise<EvidenceAttestation> {
    const result = await this.pool.query(
      `INSERT INTO cognified_evidence_attestations
       (record_id,record_hash,signer_id,key_id,algorithm,signed_at,signature_base64)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (record_id) DO NOTHING RETURNING *`,
      [attestation.recordId,attestation.recordHash,attestation.signerId,attestation.keyId,attestation.algorithm,new Date(attestation.signedAt).toISOString(),attestation.signatureBase64],
    );
    if (result.rowCount) return this.rowToAttestation(result.rows[0]);
    const existing = await this.requireAttestation(attestation.recordId);
    if (JSON.stringify(existing) !== JSON.stringify(attestation)) throw new Error(`Evidence record already has a different attestation: ${attestation.recordId}`);
    return existing;
  }

  async requireAttestation(recordId: string): Promise<EvidenceAttestation> {
    const result = await this.pool.query('SELECT * FROM cognified_evidence_attestations WHERE record_id=$1', [recordId]);
    if (!result.rowCount) throw new Error(`Competency evidence is not cryptographically attested: ${recordId}`);
    return this.rowToAttestation(result.rows[0]);
  }

  async persistPracticeDecision(sessionId: string, decision: PracticeDecision): Promise<string> {
    const id = randomUUID();
    await this.pool.query(
      `INSERT INTO cognified_practice_decisions
       (id,session_id,primitive_id,challenge_id,score,expected_learning_gain,challenge_gap,uncertainty_bonus,safety_penalty,fatigue_penalty,decision_payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,
      [id,sessionId,decision.primitiveId,decision.challengeId,decision.score,decision.expectedLearningGain,decision.challengeGap,decision.uncertaintyBonus,decision.safetyPenalty,decision.fatiguePenalty,JSON.stringify(decision)],
    );
    return id;
  }

  async persistCertificate(certificate: CompetencyCertificate): Promise<CompetencyCertificate> {
    await this.pool.query(
      `INSERT INTO cognified_certificates
       (certificate_id,learner_id,skill_id,skill_version,assessment_id,status,fingerprint,certificate_payload,issued_at,valid_until)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)
       ON CONFLICT (certificate_id) DO NOTHING`,
      [certificate.id,certificate.learnerId,certificate.skillId,certificate.skillVersion,certificate.assessmentId,certificate.status,certificate.fingerprint,JSON.stringify(certificate),new Date(certificate.issuedAt).toISOString(),certificate.validUntil ? new Date(certificate.validUntil).toISOString() : null],
    );
    const result = await this.pool.query('SELECT certificate_payload FROM cognified_certificates WHERE certificate_id=$1', [certificate.id]);
    const stored = result.rows[0].certificate_payload as CompetencyCertificate;
    if (stored.fingerprint !== certificate.fingerprint) throw new Error('Certificate identity collision');
    return stored;
  }

  private validateRuntime(runtime: RuntimeDescriptor): void {
    if (!runtime.id.trim() || !runtime.version.trim() || !runtime.supportedSkillIRVersionRange.trim() || !runtime.observationSchemaVersion.trim()) throw new Error('Runtime identity and compatibility declarations are required');
    if (runtime.measuredLatencyMs !== undefined && (!Number.isFinite(runtime.measuredLatencyMs) || runtime.measuredLatencyMs < 0)) throw new Error('Runtime latency must be non-negative');
    if (new Set(runtime.capabilities).size !== runtime.capabilities.length) throw new Error('Duplicate runtime capabilities');
  }

  private validateKey(key: TrustedEvidenceKey): void {
    if (!key.keyId.trim() || !key.signerId.trim() || !key.publicKeyPem.trim()) throw new Error('Trusted key identity and public key are required');
    createPublicKey(key.publicKeyPem);
    if (!Number.isFinite(Date.parse(key.validFrom))) throw new Error('validFrom must be a valid timestamp');
    if (key.validUntil && (!Number.isFinite(Date.parse(key.validUntil)) || Date.parse(key.validUntil) <= Date.parse(key.validFrom))) throw new Error('validUntil must follow validFrom');
  }

  private rowToRuntime(row: any): RuntimeDescriptor {
    const base = { id: row.runtime_id, family: row.family, version: row.runtime_version, capabilities: row.capabilities,
      supportedSkillIRVersionRange: row.supported_skill_ir_version_range, observationSchemaVersion: row.observation_schema_version, available: row.available } as RuntimeDescriptor;
    return row.measured_latency_ms === null ? base : { ...base, measuredLatencyMs: row.measured_latency_ms };
  }
  private rowToSession(row: any): LearnerSession {
    return { id: row.session_id, learnerId: row.learner_id, skillId: row.skill_id, skillVersion: row.skill_version,
      runtimeId: row.runtime_id, startedAt: new Date(row.started_at).toISOString(), status: row.status };
  }
  private rowToKey(row: any): TrustedEvidenceKey {
    const base = { keyId: row.key_id, signerId: row.signer_id, publicKeyPem: row.public_key_pem, status: row.status, validFrom: new Date(row.valid_from).toISOString() } as TrustedEvidenceKey;
    return row.valid_until === null ? base : { ...base, validUntil: new Date(row.valid_until).toISOString() };
  }
  private rowToAttestation(row: any): EvidenceAttestation {
    return { recordId: row.record_id, recordHash: row.record_hash, signerId: row.signer_id, keyId: row.key_id,
      algorithm: row.algorithm, signedAt: new Date(row.signed_at).toISOString(), signatureBase64: row.signature_base64 };
  }
}
