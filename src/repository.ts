import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { readJson, writeJson } from './json-store.js';
import type { LearningEvent, SkillGraph } from './types.js';
import type { LearnerState } from './learning-engine.js';

export class CognifiedRepository {
  private eventWriteQueue: Promise<void> = Promise.resolve();

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

  async appendEvent(event: LearningEvent): Promise<{ inserted: boolean }> {
    let result = { inserted: false };
    const operation = this.eventWriteQueue.then(async () => {
      const path = join(this.root, 'events', `${event.id}.json`);
      const existing = await readJson<LearningEvent | null>(path, null);
      if (existing) {
        result = { inserted: false };
        return;
      }

      await writeJson(path, event);
      result = { inserted: true };
    });

    this.eventWriteQueue = operation.then(() => undefined, () => undefined);
    await operation;
    return result;
  }

  async getEvent(id: string): Promise<LearningEvent | null> {
    return readJson(join(this.root, 'events', `${id}.json`), null);
  }

  async getEvents(): Promise<LearningEvent[]> {
    await this.eventWriteQueue;
    const dir = join(this.root, 'events');
    let names: string[];
    try {
      names = await readdir(dir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }

    const events = await Promise.all(
      names
        .filter((name) => name.endsWith('.json'))
        .map((name) => readJson<LearningEvent | null>(join(dir, name), null)),
    );

    return events
      .filter((event): event is LearningEvent => event !== null)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }
}
