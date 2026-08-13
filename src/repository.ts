import { join } from 'node:path';
import { readJson, writeJson } from './json-store.js';
import type { LearningEvent, SkillGraph } from './types.js';
import type { LearnerState } from './learning-engine.js';

export class CognifiedRepository {
  constructor(private readonly root = '.cognified') {}

  async saveGraph(graph: SkillGraph): Promise<void> {
    await writeJson(join(this.root, 'skills', `${graph.id}.json`), graph);
  }

  async getGraph(id: string): Promise<SkillGraph | null> {
    return readJson(join(this.root, 'skills', `${id}.json`), null);
  }

  async saveLearnerState(state: LearnerState): Promise<void> {
    await writeJson(join(this.root, 'learners', state.learnerId, `${state.skillId}.json`), state);
  }

  async getLearnerState(learnerId: string, skillId: string): Promise<LearnerState | null> {
    return readJson(join(this.root, 'learners', learnerId, `${skillId}.json`), null);
  }

  async appendEvent(event: LearningEvent): Promise<void> {
    const path = join(this.root, 'events.json');
    const events = await readJson<LearningEvent[]>(path, []);
    events.push(event);
    await writeJson(path, events);
  }

  async getEvents(): Promise<LearningEvent[]> {
    return readJson(join(this.root, 'events.json'), []);
  }
}
