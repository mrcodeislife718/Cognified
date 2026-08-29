import { CompetencyEvidenceAttestationRegistry, type EvidenceAttestation, type TrustedEvidenceKey } from './evidence-attestation.js';
import type { UnsignedCompetencyEvidence, CompetencyEvidenceRecord } from './competency-evidence.js';
import { LearnerTwinEngine, type LearnerObservation, type LearnerTwin } from './learner-twin.js';
import { PracticeOptimizer, type PracticeChallenge, type PracticeDecision, type PracticePolicy } from './practice-optimizer.js';
import { PostgresCompetencyEvidenceStore } from './postgres-competency-evidence.js';
import { PostgresRuntimeStateStore } from './postgres-runtime-state.js';
import { RuntimeRegistry, type RuntimeDescriptor, type RuntimeRequirement } from './runtime-registry.js';
import type { UnsignedSkillIR, SkillIR } from './skill-ir.js';
import { TransferVerificationEngine, type CompetencyCertificate, type CompetencyTrial, type VerificationPolicy } from './transfer-verifier.js';
import type { LearnerSession } from './competency-runtime.js';

const versionMatches = (version: string, range: string): boolean => {
  const major = version.match(/^(\d+)/)?.[1];
  if (!major) return false;
  if (range === version || range === major || range === `${major}.x` || range === `^${major}`) return true;
  if (range.startsWith('^')) return range.slice(1).split('.')[0] === major;
  return false;
};

export class DurableCognifiedCompetencyRuntime {
  readonly twinEngine = new LearnerTwinEngine();
  readonly practiceOptimizer: PracticeOptimizer;
  readonly verifier = new TransferVerificationEngine();

  constructor(
    readonly state: PostgresRuntimeStateStore,
    readonly evidence: PostgresCompetencyEvidenceStore,
    practicePolicy?: PracticePolicy,
  ) {
    if (state.pool !== evidence.pool) throw new Error('Durable runtime stores must share one authoritative PostgreSQL pool');
    this.practiceOptimizer = new PracticeOptimizer(practicePolicy);
  }

  async registerSkill(input: UnsignedSkillIR): Promise<SkillIR> { return this.state.registerSkill(input); }
  async registerRuntime(runtime: RuntimeDescriptor): Promise<RuntimeDescriptor> { return this.state.registerRuntime(runtime); }
  async registerEvidenceKey(key: TrustedEvidenceKey): Promise<TrustedEvidenceKey> { return this.state.registerEvidenceKey(key); }
  async revokeEvidenceKey(keyId: string): Promise<TrustedEvidenceKey> { return this.state.revokeEvidenceKey(keyId); }

  async createLearnerTwin(learnerId: string, skillId: string, skillVersion: string): Promise<LearnerTwin> {
    const skill = await this.state.requireSkill(skillId,skillVersion);
    try { return (await this.state.requireTwin(learnerId,skillId,skillVersion)).twin; }
    catch (error) {
      if (!(error instanceof Error) || error.message !== 'Learner Twin has not been initialized') throw error;
      const twin = this.twinEngine.create(learnerId,skillId,skillVersion,skill.primitives.map((primitive) => primitive.id));
      return (await this.state.createTwin(twin)).twin;
    }
  }

  async beginSession(id: string, learnerId: string, skillId: string, skillVersion: string, requirement: RuntimeRequirement): Promise<LearnerSession> {
    if (!id.trim()) throw new Error('Session id is required');
    await this.state.requireSkill(skillId,skillVersion);
    await this.createLearnerTwin(learnerId,skillId,skillVersion);
    const registry = await this.runtimeRegistry(skillVersion);
    const runtime = registry.requireCompatible(requirement);
    const session: LearnerSession = { id,learnerId,skillId,skillVersion,runtimeId: runtime.id,startedAt: new Date().toISOString(),status:'active' };
    return this.state.createSession(session);
  }

  async choosePractice(sessionId: string, challenges: PracticeChallenge[], prerequisiteMastery: Record<string,number> = {}): Promise<PracticeDecision> {
    const session = await this.requireActiveSession(sessionId);
    const { twin } = await this.state.requireTwin(session.learnerId,session.skillId,session.skillVersion);
    const decision = this.practiceOptimizer.choose(twin,challenges,prerequisiteMastery);
    await this.state.persistPracticeDecision(sessionId,decision);
    return decision;
  }

  async observeLearning(sessionId: string, observation: LearnerObservation): Promise<LearnerTwin> {
    const session = await this.requireActiveSession(sessionId);
    for (let attempt=0; attempt<5; attempt+=1) {
      const current = await this.state.requireTwin(session.learnerId,session.skillId,session.skillVersion);
      const primitive = current.twin.primitives[observation.primitiveId];
      if (!primitive) throw new Error(`Unknown learner primitive: ${observation.primitiveId}`);
      if (Date.parse(observation.observedAt) < Date.parse(primitive.updatedAt)) throw new Error('Out-of-order learner observation would regress authoritative learner state');
      const updated = this.twinEngine.apply(current.twin,observation);
      try { return (await this.state.updateTwin(updated,current.revision)).twin; }
      catch (error) {
        if (!(error instanceof Error) || error.message !== 'Learner Twin revision conflict' || attempt === 4) throw error;
      }
    }
    throw new Error('Learner Twin update retries exhausted');
  }

  async recordCompetencyEvidence(sessionId: string, input: Omit<UnsignedCompetencyEvidence,'learnerId'|'skillId'|'skillVersion'|'runtimeId'>): Promise<CompetencyEvidenceRecord> {
    const session = await this.requireActiveSession(sessionId);
    const skill = await this.state.requireSkill(session.skillId,session.skillVersion);
    if (!skill.primitives.some((primitive) => primitive.id === input.primitiveId)) throw new Error(`Evidence references unknown skill primitive: ${input.primitiveId}`);
    if (!skill.contexts.some((context) => context.id === input.contextId)) throw new Error(`Evidence references unknown skill context: ${input.contextId}`);
    return this.evidence.append({ ...input,learnerId:session.learnerId,skillId:session.skillId,skillVersion:session.skillVersion,runtimeId:session.runtimeId });
  }

  async acceptEvidenceAttestation(recordId: string, attestation: EvidenceAttestation): Promise<EvidenceAttestation> {
    const [record] = await this.evidenceByIds([recordId]);
    const registry = await this.attestationRegistry();
    registry.accept(record,attestation);
    return this.state.persistAttestation(attestation);
  }

  async verifyCompetency(learnerId: string, skillId: string, skillVersion: string, assessmentId: string, trials: CompetencyTrial[], policy: VerificationPolicy): Promise<CompetencyCertificate> {
    const skill = await this.state.requireSkill(skillId,skillVersion);
    if (!skill.assessments.some((assessment) => assessment.id === assessmentId)) throw new Error(`Unknown assessment: ${assessmentId}`);
    const records = await this.evidence.query({ learnerId,skillId,skillVersion });
    const byId = new Map(records.map((record) => [record.id,record]));
    const registry = await this.attestationRegistry();
    for (const trial of trials) {
      if (trial.learnerId !== learnerId || trial.skillId !== skillId || trial.skillVersion !== skillVersion || trial.assessmentId !== assessmentId) throw new Error('Trial identity does not match verification request');
      for (const evidenceId of trial.evidenceIds) {
        const record = byId.get(evidenceId);
        if (!record) throw new Error('Competency trial references evidence outside the authoritative evidence store');
        const attestation = await this.state.requireAttestation(evidenceId);
        registry.accept(record,attestation);
        registry.requireTrusted(record);
      }
    }
    const certificate = this.verifier.verify(trials,policy);
    return this.state.persistCertificate(certificate);
  }

  async completeSession(sessionId: string): Promise<LearnerSession> { return this.state.finishSession(sessionId,'completed'); }
  async cancelSession(sessionId: string): Promise<LearnerSession> { return this.state.finishSession(sessionId,'cancelled'); }

  private async requireActiveSession(id: string): Promise<LearnerSession> {
    const session = await this.state.requireSession(id);
    if (session.status !== 'active') throw new Error(`Session is ${session.status}`);
    return session;
  }

  private async runtimeRegistry(skillVersion: string): Promise<RuntimeRegistry> {
    const registry = new RuntimeRegistry();
    for (const runtime of await this.state.listRuntimes()) {
      if (versionMatches(skillVersion,runtime.supportedSkillIRVersionRange)) registry.register(runtime);
    }
    return registry;
  }

  private async attestationRegistry(): Promise<CompetencyEvidenceAttestationRegistry> {
    const registry = new CompetencyEvidenceAttestationRegistry();
    for (const key of await this.state.listEvidenceKeys()) registry.registerKey(key);
    return registry;
  }

  private async evidenceByIds(ids: string[]): Promise<CompetencyEvidenceRecord[]> {
    if (!ids.length) return [];
    const all = await this.evidence.query({});
    const byId = new Map(all.map((record) => [record.id,record]));
    return ids.map((id) => {
      const record=byId.get(id);
      if (!record) throw new Error(`Unknown competency evidence: ${id}`);
      return record;
    });
  }
}
