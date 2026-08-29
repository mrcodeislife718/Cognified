import { SkillIRValidator, type SkillIR, type UnsignedSkillIR } from './skill-ir.js';
import { LearnerTwinEngine, type LearnerObservation, type LearnerTwin } from './learner-twin.js';
import { PracticeOptimizer, type PracticeChallenge, type PracticeDecision, type PracticePolicy } from './practice-optimizer.js';
import { CompetencyEvidenceStore, type CompetencyEvidenceRecord, type UnsignedCompetencyEvidence } from './competency-evidence.js';
import { TransferVerificationEngine, type CompetencyCertificate, type CompetencyTrial, type VerificationPolicy } from './transfer-verifier.js';
import { RuntimeRegistry, type RuntimeDescriptor, type RuntimeRequirement } from './runtime-registry.js';

export type LearnerSession = {
  id: string;
  learnerId: string;
  skillId: string;
  skillVersion: string;
  runtimeId: string;
  startedAt: string;
  status: 'active' | 'completed' | 'cancelled';
};

export class CognifiedCompetencyRuntime {
  readonly skillValidator = new SkillIRValidator();
  readonly twinEngine = new LearnerTwinEngine();
  readonly practiceOptimizer: PracticeOptimizer;
  readonly evidence = new CompetencyEvidenceStore();
  readonly verifier = new TransferVerificationEngine();
  readonly runtimes = new RuntimeRegistry();

  private readonly skills = new Map<string, SkillIR>();
  private readonly twins = new Map<string, LearnerTwin>();
  private readonly sessions = new Map<string, LearnerSession>();

  constructor(practicePolicy?: PracticePolicy) {
    this.practiceOptimizer = new PracticeOptimizer(practicePolicy);
  }

  registerSkill(input: UnsignedSkillIR): SkillIR {
    const skill = this.skillValidator.validate(input);
    const key = this.skillKey(skill.id, skill.version);
    const existing = this.skills.get(key);
    if (existing && existing.fingerprint !== skill.fingerprint) throw new Error(`Skill version ${key} is immutable once registered`);
    this.skills.set(key, structuredClone(skill));
    return structuredClone(skill);
  }

  registerRuntime(runtime: RuntimeDescriptor): void {
    this.runtimes.register(runtime);
  }

  createLearnerTwin(learnerId: string, skillId: string, skillVersion: string): LearnerTwin {
    const skill = this.requireSkill(skillId, skillVersion);
    const key = this.twinKey(learnerId, skillId, skillVersion);
    const existing = this.twins.get(key);
    if (existing) return structuredClone(existing);
    const twin = this.twinEngine.create(learnerId, skillId, skillVersion, skill.primitives.map((primitive) => primitive.id));
    this.twins.set(key, twin);
    return structuredClone(twin);
  }

  beginSession(id: string, learnerId: string, skillId: string, skillVersion: string, requirement: RuntimeRequirement): LearnerSession {
    if (!id.trim()) throw new Error('Session id is required');
    if (this.sessions.has(id)) throw new Error(`Session already exists: ${id}`);
    this.requireSkill(skillId, skillVersion);
    this.createLearnerTwin(learnerId, skillId, skillVersion);
    const runtime = this.runtimes.requireCompatible(requirement);
    const session: LearnerSession = { id, learnerId, skillId, skillVersion, runtimeId: runtime.id, startedAt: new Date().toISOString(), status: 'active' };
    this.sessions.set(id, session);
    return structuredClone(session);
  }

  choosePractice(sessionId: string, challenges: PracticeChallenge[], prerequisiteMastery: Record<string, number> = {}): PracticeDecision {
    const session = this.requireActiveSession(sessionId);
    const twin = this.requireTwin(session.learnerId, session.skillId, session.skillVersion);
    return this.practiceOptimizer.choose(twin, challenges, prerequisiteMastery);
  }

  observeLearning(sessionId: string, observation: LearnerObservation): LearnerTwin {
    const session = this.requireActiveSession(sessionId);
    const key = this.twinKey(session.learnerId, session.skillId, session.skillVersion);
    const twin = this.requireTwin(session.learnerId, session.skillId, session.skillVersion);
    const updated = this.twinEngine.apply(twin, observation);
    this.twins.set(key, updated);
    return structuredClone(updated);
  }

  recordCompetencyEvidence(sessionId: string, input: Omit<UnsignedCompetencyEvidence, 'learnerId' | 'skillId' | 'skillVersion' | 'runtimeId'>): CompetencyEvidenceRecord {
    const session = this.requireActiveSession(sessionId);
    const skill = this.requireSkill(session.skillId, session.skillVersion);
    if (!skill.primitives.some((primitive) => primitive.id === input.primitiveId)) throw new Error(`Evidence references unknown skill primitive: ${input.primitiveId}`);
    if (!skill.contexts.some((context) => context.id === input.contextId)) throw new Error(`Evidence references unknown skill context: ${input.contextId}`);
    return this.evidence.append({ ...input, learnerId: session.learnerId, skillId: session.skillId, skillVersion: session.skillVersion, runtimeId: session.runtimeId });
  }

  verifyCompetency(learnerId: string, skillId: string, skillVersion: string, assessmentId: string, trials: CompetencyTrial[], policy: VerificationPolicy): CompetencyCertificate {
    const skill = this.requireSkill(skillId, skillVersion);
    if (!skill.assessments.some((assessment) => assessment.id === assessmentId)) throw new Error(`Unknown assessment: ${assessmentId}`);
    const availableEvidence = new Set(this.evidence.query({ learnerId, skillId, skillVersion }).map((record) => record.id));
    for (const trial of trials) {
      if (trial.learnerId !== learnerId || trial.skillId !== skillId || trial.skillVersion !== skillVersion || trial.assessmentId !== assessmentId) throw new Error('Trial identity does not match verification request');
      if (!trial.evidenceIds.every((id) => availableEvidence.has(id))) throw new Error('Competency trial references evidence outside the authoritative evidence store');
    }
    return this.verifier.verify(trials, policy);
  }

  completeSession(sessionId: string): LearnerSession {
    const session = this.requireActiveSession(sessionId);
    session.status = 'completed';
    return structuredClone(session);
  }

  private requireSkill(id: string, version: string): SkillIR {
    const skill = this.skills.get(this.skillKey(id, version));
    if (!skill) throw new Error(`Unknown versioned skill: ${id}@${version}`);
    return skill;
  }

  private requireTwin(learnerId: string, skillId: string, version: string): LearnerTwin {
    const twin = this.twins.get(this.twinKey(learnerId, skillId, version));
    if (!twin) throw new Error('Learner Twin has not been initialized');
    return twin;
  }

  private requireActiveSession(id: string): LearnerSession {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`Unknown session: ${id}`);
    if (session.status !== 'active') throw new Error(`Session is ${session.status}`);
    return session;
  }

  private skillKey(id: string, version: string): string { return `${id}@${version}`; }
  private twinKey(learnerId: string, skillId: string, version: string): string { return `${learnerId}:${skillId}@${version}`; }
}
