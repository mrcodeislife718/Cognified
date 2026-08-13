import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { extname, join } from 'node:path';
import { CognifiedService } from './service.js';
import type { LearningEvent } from './types.js';

const service = new CognifiedService();
const webRoot = join(process.cwd(), 'apps', 'web');

async function body(req: import('node:http').IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function send(res: import('node:http').ServerResponse, status: number, value: unknown) {
  const payload = JSON.stringify(value, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function sendFile(res: import('node:http').ServerResponse, file: string) {
  const payload = await readFile(file);
  const type = extname(file) === '.js' ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8';
  res.writeHead(200, { 'content-type': type, 'content-length': payload.length });
  res.end(payload);
}

export function startServer(port = Number(process.env.PORT ?? 8787)) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

      if (req.method === 'GET' && url.pathname === '/') return await sendFile(res, join(webRoot, 'index.html'));
      if (req.method === 'GET' && url.pathname === '/app.js') return await sendFile(res, join(webRoot, 'app.js'));

      if (req.method === 'GET' && url.pathname === '/health') {
        return send(res, 200, { ok: true, service: 'cognified', version: '0.1.0' });
      }

      if (req.method === 'POST' && url.pathname === '/skills') {
        const input = await body(req) as { title?: string; sources?: Array<{ title: string; text: string; uri?: string; authority?: 'primary' | 'secondary' | 'user' }> };
        if (!input.title || !input.sources) return send(res, 400, { error: 'title and sources are required' });
        return send(res, 201, await service.createSkill(input.title, input.sources));
      }

      const sessionMatch = url.pathname.match(/^\/learners\/([^/]+)\/skills\/([^/]+)\/session$/);
      if (req.method === 'POST' && sessionMatch) {
        return send(res, 200, await service.startSession(decodeURIComponent(sessionMatch[1]), decodeURIComponent(sessionMatch[2])));
      }

      if (req.method === 'POST' && url.pathname === '/events') {
        const input = await body(req) as Partial<LearningEvent>;
        const required = ['sessionId', 'learnerId', 'skillId', 'nodeId', 'kind', 'correct', 'responseMs', 'confidence', 'assistanceUsed'] as const;
        for (const field of required) {
          if (input[field] === undefined) return send(res, 400, { error: `${field} is required` });
        }
        const event: LearningEvent = {
          ...(input as LearningEvent),
          id: input.id ?? randomUUID(),
          timestamp: input.timestamp ?? new Date().toISOString(),
        };
        return send(res, 200, await service.recordEvent(event));
      }

      const competencyMatch = url.pathname.match(/^\/learners\/([^/]+)\/skills\/([^/]+)\/competency$/);
      if (req.method === 'GET' && competencyMatch) {
        return send(res, 200, await service.getCompetency(decodeURIComponent(competencyMatch[1]), decodeURIComponent(competencyMatch[2])));
      }

      send(res, 404, { error: 'not found' });
    } catch (error) {
      send(res, 500, { error: error instanceof Error ? error.message : 'unknown error' });
    }
  });

  server.listen(port);
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) startServer();
