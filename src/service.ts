import { SkillGraphCompiler, type RawLearningSource } from './compiler.js';
import { LearningEngine } from './learning-engine.js';
import { CompetencyScorer } from './scoring.js';
import { CognifiedRepository } from './repository.js';
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
    await this.repository.saveGraph(graph);
    return graph;
  }

  async startSession(learnerId: string, skillId: string) {
    const graph = await this.requireGraph(skillId);
    const existing = await this.repository.getLearnerState(learnerId, skillId);
    const state = existing ?? this.engine.createState(learnerId, graph);
    await this.repository.saveLearnerState(state);
    return { state, experience: this.engine.next(graph, state) };
  }

  async recordEvent(event: LearningEvent) {
    const graph = await this.requireGraph(event.skillId);
    const state = await this.repository.getLearnerState(event.learnerId, event.skillId);
    if (!state) throw new Error('Learner session not initialized');

    const nextState = this.engine.apply(state, event);
    await this.repository.appendEvent(event);
    await this.repository.saveLearnerState(nextState);

    return {
      state: nextState,
      nextExperience: this.engine.next(graph, nextState),
      competency: this.scorer.score(event.learnerId, event.skillId, await this.repository.getEvents()),
    };
  }

  async getCompetency(learnerId: string, skillId: string) {
    await this.requireGraph(skillId);
    return this.scorer.score(learnerId, skillId, await this.repository.getEvents());
  }

  private async requireGraph(skillId: string) {
    const graph = await this.repository.getGraph(skillId);
    if (!graph) throw new Error(`Unknown skill: ${skillId}`);
    return graph;
  }
}
