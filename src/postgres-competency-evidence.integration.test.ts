import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { PostgresCompetencyEvidenceStore } from './postgres-competency-evidence.js';

const databaseUrl = process.env.DATABASE_URL;

test('PostgreSQL competency evidence survives persistence and preserves tamper-evident chain semantics', { skip: !databaseUrl }, async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  try {
    const migration = await readFile(new URL('../migrations/001_competency_evidence.sql', import.meta.url), 'utf8');
    await pool.query(migration);
    await pool.query('TRUNCATE cognified_competency_evidence');
    const store = new PostgresCompetencyEvidenceStore({ pool });
    await store.append({ learnerId: 'learner:1', skillId: 'skill:1', skillVersion: '1.0.0', primitiveId: 'primitive:1', contextId: 'baseline', runtimeId: 'openxr:runtime', evidenceClass: 'behavioral', evidenceArtifactIds: ['artifact:1'], metrics: { accuracy: 0.91, assistanceUsed: false }, observedAt: '2026-08-29T14:00:00.000Z', protocolVersion: '1.0.0', signerId: 'runtime:1' });
    await store.append({ learnerId: 'learner:1', skillId: 'skill:1', skillVersion: '1.0.0', primitiveId: 'primitive:1', assessmentId: 'assessment:transfer', contextId: 'novel-context', runtimeId: 'webxr:runtime', evidenceClass: 'behavioral', evidenceArtifactIds: ['artifact:2'], metrics: { accuracy: 0.87, transfer: 0.82 }, observedAt: '2026-08-30T14:00:00.000Z', protocolVersion: '1.0.0', signerId: 'runtime:2' });
    assert.equal((await store.query({ learnerId: 'learner:1', skillId: 'skill:1' })).length, 2);
    assert.equal(await store.verifyChain(), true);
  } finally {
    await pool.end();
  }
});
