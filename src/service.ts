import { SkillGraphCompiler, type RawLearningSource } from './compiler.js';
import { LearningEngine } from './learning-engine.js';
import { CompetencyScorer } from './scoring.js';
import { CognifiedRepository } from './repository.js';
import { validateGraph } from './package-validator.js';
import type { LearningEvent } from './types.js';

export class CognifiedService {
  constructor(
    private readonly repository = new CognifiedRepository(),
    private readonly compiler = new SkillGraphCompiler(),
    private readonly engine = new LearningEngine(),
    private readonly scorer = new CompetencyScorer(),
  ) {}

  async createSkill(title: string, sources: RawLearningSource[]) {
    const graph = this.compiler.compile(title, sources);
    const validation = validateGraph(graph);
    if (!validation.valid) {
      throw new Error(`Compiled skill graph failed validation: ${validation.errors.join('; ')}`);
    }
    await this.repository.saveGraph(graph);
    return { ...graph, digest: validation.digest };
  }

  async startSession(learnerId: string, skillId: string) {
    if (!learnerId.trim()) throw new Error('learnerId is required');
    const graph = await this.requireGraph(skillId);
    const existing = await this.repository.getLearnerState(learnerId, skillId);
    const state = existing ? this.engine.beginSession(existing) : this.engine.createState(learnerId, graph);
    await this.repository.saveLearnerState(state);
    return { sessionId: state.activeSessionId, state, experience: this.engine.next(graph, state) };
  }

  async recordEvent(event: LearningEvent) {
    this.validateEvent(event);
    const graph = await this.requireGraph(event.skillId);
    const state = await this.repository.getLearnerState(event.learnerId, event.skillId);
    if (!state) throw new Error('Learner session not initialized');
    if (event.sessionId !== state.activeSessionId) throw new Error('event session does not match active learner session');
    if (!graph.nodes.some((node) => node.id === event.nodeId)) throw new Error(`Unknown node: ${event.nodeId}`);

    const existingEvent = await this.repository.getEvent(event.id);
    if (existingEvent) {
      const events = await this.repository.getEvents();
      return {
        duplicate: true,
        state,
        nextExperience: this.engine.next(graph, state),
        competency: this.scorer.score(event.learnerId, event.skillId, events, graph),
      };
    }

    const nextState = this.engine.apply(state, event);
    const append = await this.repository.appendEvent(event);
    if (append.inserted) await this.repository.saveLearnerState(nextState);

    const persistedState = append.inserted ? nextState : state;
    const events = await this.repository.getEvents();
    return {
      duplicate: !append.inserted,
      state: persistedState,
      nextExperience: this.engine.next(graph, persistedState),
      competency: this.scorer.score(event.learnerId, event.skillId, events, graph),
    };
  }

  async getCompetency(learnerId: string, skillId: string) {
    const graph = await this.requireGraph(skillId);
    return this.scorer.score(learnerId, skillId, await this.repository.getEvents(), graph);
  }

  private async requireGraph(skillId: string) {
    const graph = await this.repository.getGraph(skillId);
    if (!graph) throw new Error(`Unknown skill: ${skillId}`);
    return graph;
  }

  private validateEvent(event: LearningEvent) {
    if (!event.id.trim()) throw new Error('event id is required');
    if (!event.sessionId.trim()) throw new Error('sessionId is required');
    if (!event.learnerId.trim()) throw new Error('learnerId is required');
    if (!event.skillId.trim()) throw new Error('skillId is required');
    if (!event.nodeId.trim()) throw new Error('nodeId is required');
    if (!Number.isFinite(event.responseMs) || event.responseMs < 0) throw new Error('responseMs must be non-negative');
    if (!Number.isFinite(event.confidence) || event.confidence < 0 || event.confidence > 1) throw new Error('confidence must be between 0 and 1');
    if (!Number.isFinite(Date.parse(event.timestamp))) throw new Error('timestamp must be a valid ISO date');
  }
}
