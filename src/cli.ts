import { readFile } from 'node:fs/promises';
import { CognifiedService } from './service.js';
import { startServer } from './server.js';

const service = new CognifiedService();

async function main() {
  const [command, ...args] = process.argv.slice(2);

  if (command === 'serve') {
    const port = args[0] ? Number(args[0]) : undefined;
    startServer(port);
    return;
  }

  if (command === 'compile') {
    const [title, file] = args;
    if (!title || !file) throw new Error('Usage: cognified compile <title> <text-file>');
    const text = await readFile(file, 'utf8');
    const graph = await service.createSkill(title, [{ title: file, text, authority: 'user' }]);
    console.log(JSON.stringify(graph, null, 2));
    return;
  }

  if (command === 'start') {
    const [learnerId, skillId] = args;
    if (!learnerId || !skillId) throw new Error('Usage: cognified start <learnerId> <skillId>');
    console.log(JSON.stringify(await service.startSession(learnerId, skillId), null, 2));
    return;
  }

  if (command === 'score') {
    const [learnerId, skillId] = args;
    if (!learnerId || !skillId) throw new Error('Usage: cognified score <learnerId> <skillId>');
    console.log(JSON.stringify(await service.getCompetency(learnerId, skillId), null, 2));
    return;
  }

  console.log(`Cognified CLI\n\nCommands:\n  serve [port]\n  compile <title> <text-file>\n  start <learnerId> <skillId>\n  score <learnerId> <skillId>`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
