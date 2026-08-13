import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CognifiedRepository } from './repository.js';
import { CognifiedService } from './service.js';
import { validateGraph } from './package-validator.js';

test('compiles source material, starts a session, records evidence, and scores competency', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cognified-'));
  try {
    const repository = new CognifiedRepository(root);
    const service = new CognifiedService(repository);

    const graph = await service.createSkill('HTTP Fundamentals', [{
      title: 'HTTP lesson',
      authority: 'primary',
      text: 'HTTP is an application protocol used for network communication. First create a request, then send it to a server, and finally inspect the response. Status codes communicate the result of the request.',
    }]);

    assert.equal(validateGraph(graph).valid, true);
    assert.ok(graph.nodes.length > 0);

    const session = await service.startSession('learner-1', graph.id);
    assert.ok(session.experience);

    const result = await service.recordEvent({
      learnerId: 'learner-1',
      skillId: graph.id,
      nodeId: session.experience!.nodeId,
      kind: 'recall',
      correct: true,
      responseMs: 1200,
      confidence: 0.9,
      assistanceUsed: false,
      timestamp: new Date().toISOString(),
    });

    assert.equal(result.competency.evidenceCount, 1);
    assert.ok(result.competency.overall >= 0);
    assert.ok(result.state.mastery[session.experience!.nodeId] > 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
