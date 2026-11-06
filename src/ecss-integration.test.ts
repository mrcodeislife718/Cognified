import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { CognifiedRepository } from './repository.js';
import { CognifiedService } from './service.js';

test('E-CSS pacing integrates with accepted learning evidence and cannot auto-resume after stop', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cognified-ecss-'));
  try {
    const service = new CognifiedService(new CognifiedRepository(root));
    const skill = await service.createSkill('Network protocols', [{
      title: 'First lesson', authority: 'primary',
      text: 'A protocol specifies the format and sequencing of messages. First inspect a request, then inspect a response.',
    }]);
    const session = await service.startSession('student-1', skill.id);
    assert.equal(session.pacing.presentationRate, 1);
    const stopped = await service.reportComfort({
      sessionId: session.sessionId, learnerId: 'student-1', skillId: skill.id, comfort: 'stop',
    });
    assert.equal(stopped.mode, 'paused');

    const event = {
      id: randomUUID(), sessionId: session.sessionId, learnerId: 'student-1',
      skillId: skill.id, nodeId: session.experience!.nodeId, kind: 'recall' as const,
      correct: true, responseMs: 900, confidence: 0.9,
      assistanceUsed: false, timestamp: new Date().toISOString(),
    };
    const recorded = await service.recordEvent(event);
    assert.equal(recorded.duplicate, false);
    assert.equal(recorded.pacing.mode, 'paused');
    const duplicate = await service.recordEvent(event);
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.pacing.mode, 'paused');

    await assert.rejects(
      () => service.reportComfort({ sessionId: 'wrong', learnerId: 'student-1', skillId: skill.id, comfort: 'ok', resume: true }),
      /Unknown or inactive/,
    );

    const restarted = await service.reportComfort({
      sessionId: session.sessionId, learnerId: 'student-1', skillId: skill.id,
      comfort: 'ok', resume: true,
    });
    assert.equal(restarted.mode, 'running');
    assert.equal(restarted.presentationRate, 1);

    const nextSession = await service.startSession('student-1', skill.id);
    assert.notEqual(nextSession.sessionId, session.sessionId);
    await assert.rejects(
      () => service.reportComfort({ sessionId: session.sessionId, learnerId: 'student-1', skillId: skill.id, comfort: 'strained' }),
      /Unknown or inactive/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
