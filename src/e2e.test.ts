import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { CognifiedRepository } from './repository.js';
import { CognifiedService } from './service.js';
import { validateGraph } from './package-validator.js';

test('compiles source material, starts a session, records idempotent evidence, and scores competency', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cognified-'));
  try {
    const repository = new CognifiedRepository(root);
    const service = new CognifiedService(repository);
    const graph = await service.createSkill('HTTP Fundamentals', [{ title: 'HTTP lesson', authority: 'primary', text: 'HTTP is an application protocol used for network communication. First create a request, then send it to a server, and finally inspect the response. Status codes communicate the result of the request.' }]);
    assert.equal(validateGraph(graph).valid, true);
    const session = await service.startSession('learner-1', graph.id);
    assert.ok(session.experience);
    const event = { id: randomUUID(), sessionId: session.sessionId, learnerId: 'learner-1', skillId: graph.id, nodeId: session.experience!.nodeId, kind: 'recall' as const, correct: true, responseMs: 1200, confidence: 0.9, assistanceUsed: false, timestamp: new Date().toISOString() };
    const result = await service.recordEvent(event);
    assert.equal(result.duplicate, false);
    assert.equal(result.competency.evidenceCount, 1);
    assert.ok(result.competency.evidenceStrength > 0);
    const duplicate = await service.recordEvent(event);
    assert.equal(duplicate.duplicate, true);
    assert.equal((await repository.getEvents()).length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('starting a new session rotates the active session identifier', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cognified-'));
  try {
    const service = new CognifiedService(new CognifiedRepository(root));
    const graph = await service.createSkill('Networking', [{ title: 'Lesson', authority: 'primary', text: 'Networks connect systems. Packets carry data between endpoints.' }]);
    const first = await service.startSession('learner-2', graph.id);
    const second = await service.startSession('learner-2', graph.id);
    assert.notEqual(first.sessionId, second.sessionId);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('simultaneous duplicate event writes persist once', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cognified-'));
  try {
    const repository = new CognifiedRepository(root);
    const event = { id: randomUUID(), sessionId: randomUUID(), learnerId: 'learner-3', skillId: 'skill-1', nodeId: 'node-1', kind: 'recognition' as const, correct: true, responseMs: 800, confidence: 0.8, assistanceUsed: false, timestamp: new Date().toISOString() };
    const results = await Promise.all([repository.appendEvent(event), repository.appendEvent(event), repository.appendEvent(event)]);
    assert.equal(results.filter((result) => result.inserted).length, 1);
    assert.equal((await repository.getEvents()).length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
