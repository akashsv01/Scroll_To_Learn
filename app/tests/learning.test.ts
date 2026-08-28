import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createPostHandler } from '../app/api/generate/route';
import {
  GenerateRequestSchema,
  parseGeneratedBatch,
  type GenerateRequest,
  type LearningCard,
} from '../lib/learning';
import {
  createFeedReset,
  filterDuplicateCards,
  revealText,
  shouldPrefetch,
} from '../lib/feed';

const chessIdeas = [
  'Controlling central squares gives pieces more routes and restricts the opponent’s movement.',
  'Developing knights and bishops early connects the rooks and prepares the king to castle.',
  'A loose piece is undefended, so every tactical scan should check whether it can be attacked.',
  'A pawn move cannot be reversed, which makes every pawn advance a lasting structural decision.',
  'King safety often matters more than grabbing a pawn during the opening phase of a game.',
  'A forcing-move scan checks candidate checks, captures, and threats before quieter alternatives.',
  'An outpost is a protected square that enemy pawns can no longer attack effectively.',
  'Opposition is an endgame technique where kings face each other with one square between them.',
];

function makeCard(index: number, topic = 'Chess', type: LearningCard['type'] = 'concept'): LearningCard {
  const content = topic === 'Chess'
    ? chessIdeas[index % chessIdeas.length]
    : `${topic} concept ${index + 1} explains a distinct, practical domain principle with accurate terminology.`;
  return {
    id: `card-${index}`,
    type,
    title: `${topic} idea ${index + 1}`,
    content,
    detail: `A concrete ${topic} example adds a different layer of useful context for idea ${index + 1}.`,
    difficulty: index < 3 ? 1 : index < 6 ? 2 : 3,
    tags: [topic, `tag-${index}`],
    answer: type === 'recall' || type === 'challenge' ? `${topic} answer ${index + 1}` : null,
    sourceConfidence: .95,
    quiz: {
      question: `Which option correctly applies ${topic} idea ${index + 1}?`,
      optionA: 'The accurate application',
      optionB: 'The unrelated application',
      correct: 'A',
      explanation: `Option A correctly applies the ${topic} principle described on the card.`,
    },
  };
}

function requestInput(topic = 'Chess'): GenerateRequest {
  return GenerateRequestSchema.parse({ topic, level: 'beginner', goal: '', previousCards: [], depth: 1 });
}

describe('dynamic generation pipeline', () => {
  it('passes the selected topic and level to the generation provider', async () => {
    let captured: GenerateRequest | undefined;
    const handler = createPostHandler({
      getApiKey: () => 'test-key',
      generateCards: async (input) => { captured = input; return [makeCard(0, input.topic)]; },
    });
    const response = await handler(new Request('http://localhost/api/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: 'React', level: 'intermediate', goal: 'Understand rendering', previousCards: [], depth: 2 }),
    }));
    expect(response.status).toBe(200);
    expect(captured).toMatchObject({ topic: 'React', level: 'intermediate', goal: 'Understand rendering', depth: 2 });
  });

  it('contains no hardcoded production starter or Chess fallback path', () => {
    const source = readFileSync(new URL('../app/api/generate/route.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/STARTERS|fallbackCards|Trying to retrieve an idea about/i);
  });

  it('parses strict structured batches and keeps eight valid cards', () => {
    const cards = Array.from({ length: 8 }, (_, index) => makeCard(index));
    const parsed = parseGeneratedBatch({ topic: 'Chess', level: 'beginner', cards }, requestInput());
    expect(parsed).toHaveLength(8);
    expect(parsed.every((card) => card.content.length > 0 && card.quiz.question.length > 0)).toBe(true);
  });

  it('fully resets feed history and indices when the topic changes', () => {
    const reset = createFeedReset('React', 'advanced', 'Rendering performance');
    expect(reset).toMatchObject({ activeTopic: 'React', activeLevel: 'advanced', pairIndex: 0, stage: 'fact', depth: 1 });
    expect(reset.cards).toEqual([]);
    expect(reset.history).toEqual([]);
  });

  it('filters duplicate card content', () => {
    const first = makeCard(0);
    const duplicate = { ...first, id: 'duplicate', title: 'A slightly different heading' };
    expect(filterDuplicateCards([first, duplicate], [])).toHaveLength(1);
  });

  it('reveals a topic answer for active recall cards', () => {
    const recall = makeCard(2, 'React', 'recall');
    expect(revealText(recall)).toBe('React answer 3');
    expect(revealText(recall)).not.toBe(recall.detail);
  });

  it('returns an honest API error without static cards when generation fails', async () => {
    const handler = createPostHandler({
      getApiKey: () => 'test-key',
      generateCards: async () => { throw new Error('provider unavailable'); },
    });
    const response = await handler(new Request('http://localhost/api/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic: 'SQL' }),
    }));
    const payload = await response.json() as { error?: string; cards?: unknown[] };
    expect(response.status).toBe(502);
    expect(payload.error).toContain('Couldn’t generate');
    expect(payload.cards).toBeUndefined();
  });

  it('returns configuration error without exposing fallback content when the API key is missing', async () => {
    const handler = createPostHandler({ getApiKey: () => undefined });
    const response = await handler(new Request('http://localhost/api/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic: 'Photography' }),
    }));
    const payload = await response.json() as { code?: string; cards?: unknown[] };
    expect(response.status).toBe(503);
    expect(payload.code).toBe('GEMINI_NOT_CONFIGURED');
    expect(payload.cards).toBeUndefined();
  });

  it('accepts an arbitrary custom topic', () => {
    const parsed = GenerateRequestSchema.parse({ topic: 'PostgreSQL indexing', level: 'intermediate' });
    expect(parsed.topic).toBe('PostgreSQL indexing');
  });

  it('prefetches before the current batch is exhausted', () => {
    expect(shouldPrefetch(8, 5, false)).toBe(true);
    expect(shouldPrefetch(8, 4, false)).toBe(false);
    expect(shouldPrefetch(8, 6, true)).toBe(false);
  });
});
