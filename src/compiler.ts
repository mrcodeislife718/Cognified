import { createHash } from 'node:crypto';
import type { EvidenceSource, SkillGraph, SkillNode } from './types.js';

export type RawLearningSource = {
  title: string;
  text: string;
  uri?: string;
  authority?: EvidenceSource['authority'];
};

const normalize = (value: string) => value.trim().replace(/\s+/g, ' ');
const slug = (value: string) => normalize(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export class SkillGraphCompiler {
  compile(title: string, sources: RawLearningSource[]): SkillGraph {
    if (!title.trim()) throw new Error('Skill title is required');
    if (!sources.length) throw new Error('At least one source is required');

    const evidence: EvidenceSource[] = sources.map((source, index) => ({
      id: `evidence-${index + 1}`,
      title: normalize(source.title),
      uri: source.uri,
      authority: source.authority ?? 'user',
      confidence: source.authority === 'primary' ? 1 : source.authority === 'secondary' ? 0.85 : 0.7,
    }));

    const nodes: SkillNode[] = [];

    sources.forEach((source, sourceIndex) => {
      const sections = source.text
        .split(/\n{2,}|(?<=[.!?])\s+(?=[A-Z0-9])/)
        .map(normalize)
        .filter((section) => section.length >= 24);

      sections.forEach((section, sectionIndex) => {
        const words = section.split(' ');
        const nodeTitle = words.slice(0, Math.min(8, words.length)).join(' ');
        const id = `${slug(title)}-${sourceIndex + 1}-${sectionIndex + 1}`;
        const previous = nodes.at(-1);
        const procedureLike = /\b(first|next|then|finally|step|install|run|create|build|configure|verify|test)\b/i.test(section);

        nodes.push({
          id,
          title: nodeTitle,
          description: section,
          prerequisites: previous ? [previous.id] : [],
          concepts: this.extractConcepts(section),
          procedures: procedureLike ? [section] : [],
          evidenceIds: [evidence[sourceIndex].id],
          difficulty: Math.min(1, Math.max(0.1, words.length / 180)),
        });
      });
    });

    if (!nodes.length) throw new Error('Sources did not contain enough material to compile a skill graph');

    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ title: normalize(title), evidence, nodes }))
      .digest('hex')
      .slice(0, 16);

    return {
      id: `${slug(title)}-${fingerprint}`,
      title: normalize(title),
      version: '1.0.0',
      nodes,
      evidence,
    };
  }

  private extractConcepts(text: string): string[] {
    const stop = new Set(['this', 'that', 'with', 'from', 'have', 'will', 'into', 'your', 'then', 'when', 'where', 'what', 'which', 'their', 'there', 'about']);
    const counts = new Map<string, number>();
    for (const raw of text.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) ?? []) {
      if (stop.has(raw)) continue;
      counts.set(raw, (counts.get(raw) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 8)
      .map(([word]) => word);
  }
}
