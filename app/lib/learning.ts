import { z } from 'zod';
import { compactCard, filterDuplicateCards, normalizeText, textSimilarity, type CompactCard } from './feed';

export const CARD_TYPES = ['fact', 'concept', 'example', 'misconception', 'recall', 'challenge', 'tip', 'comparison'] as const;
export const LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export const BATCH_SIZE = 8;

export const CardTypeSchema = z.enum(CARD_TYPES);
export const LevelSchema = z.enum(LEVELS);

export const QuizSchema = z.object({
  question: z.string().min(10).max(280),
  optionA: z.string().min(1).max(120),
  optionB: z.string().min(1).max(120),
  correct: z.enum(['A', 'B']),
  explanation: z.string().min(8).max(280),
}).strict();

export const LearningCardSchema = z.object({
  id: z.string().min(1).max(100),
  type: CardTypeSchema,
  title: z.string().min(2).max(80).nullable().optional(),
  content: z.string().min(20).max(560),
  detail: z.string().min(10).max(760).nullable().optional(),
  difficulty: z.number().int().min(1).max(3),
  tags: z.array(z.string().min(1).max(40)).min(1).max(6),
  answer: z.string().min(2).max(500).nullable().optional(),
  sourceConfidence: z.number().min(0).max(1),
  quiz: QuizSchema,
}).strict();

export const GeneratedBatchSchema = z.object({
  topic: z.string().min(1).max(100),
  level: LevelSchema,
  cards: z.array(LearningCardSchema).min(6).max(10),
}).strict();

export const CompactCardSchema = z.object({
  type: z.string().max(30),
  title: z.string().max(80),
  summary: z.string().max(180),
  tags: z.array(z.string().max(40)).max(6),
}).strict();

export const GenerateRequestSchema = z.object({
  topic: z.string().trim().min(1).max(100),
  level: LevelSchema.default('beginner'),
  goal: z.string().trim().max(200).optional().default(''),
  previousCards: z.array(CompactCardSchema).max(32).optional().default([]),
  likedSubtopics: z.array(z.string().max(80)).max(16).optional().default([]),
  skippedSubtopics: z.array(z.string().max(80)).max(16).optional().default([]),
  depth: z.number().int().min(1).max(6).optional().default(1),
}).strict();

export type LearningCard = z.infer<typeof LearningCardSchema>;
export type GeneratedBatch = z.infer<typeof GeneratedBatchSchema>;
export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;
export type Level = z.infer<typeof LevelSchema>;

const GENERIC_STUDY_ADVICE = /\b(active recall|retrieval practice|spaced repetition|study session|study technique|learning science|memory strengthens?|remember better|rereading)\b/i;
const LEARNING_TOPICS = /\b(learning|memory|education|study|cognitive science|pedagogy)\b/i;

export const SYSTEM_INSTRUCTION = `You generate high-quality microlearning cards for a scroll-based educational app.

Every card MUST be directly and substantively related to the user's selected topic. Never substitute generic study advice, motivational language, filler, learning theory, memory advice, active-recall theory, or retrieval-practice advice unless the selected topic itself is about those subjects.

Use a varied mix of concepts, facts, examples, misconceptions, topic-knowledge recall prompts, mini challenges, practical tips, and comparisons. "Recall" and "challenge" describe the interaction: their content must ask about the selected topic and their answer must reveal the topic-specific answer.

Each card teaches exactly one useful idea. Keep content to roughly 20–60 words and detail to roughly 20–80 words. Detail adds depth and must not restate the main content. Use accurate, conservative claims; never invent statistics, dates, quotations, or historical claims. Use correct terminology for technical topics and avoid oversimplifying controversial or historical topics.

Return only JSON matching the response schema.`;

export function createUserPrompt(input: GenerateRequest) {
  const depthGuide = input.depth === 1
    ? 'foundational, high-value ideas'
    : input.depth === 2
      ? 'applied concepts and concrete examples'
      : 'increasingly nuanced ideas, tradeoffs, misconceptions, and mini challenges';
  return `Selected topic: ${JSON.stringify(input.topic)}
Learner level: ${input.level}
Optional learner goal: ${input.goal ? JSON.stringify(input.goal) : 'none'}
Feed depth: ${input.depth} (${depthGuide})
Generate exactly ${BATCH_SIZE} new cards in one batch.

Previous cards to avoid repeating:
${JSON.stringify(input.previousCards)}

Emphasize these user-liked angles when relevant: ${JSON.stringify(input.likedSubtopics)}
Deprioritize these skipped angles: ${JSON.stringify(input.skippedSubtopics)}

Requirements:
- Set the root topic to exactly ${JSON.stringify(input.topic)} and root level to ${JSON.stringify(input.level)}.
- Every content, detail, answer, quiz, title, and tag must concern ${JSON.stringify(input.topic)}.
- Include a varied mix of at least four card types.
- Recall/challenge cards must ask a topic-knowledge question and include its answer.
- Every card must include a binary quiz that tests the card's idea.
- Do not repeat previous cards or concepts.
- Avoid generic study or memory advice.
- Progress appropriately for the requested level and depth.`;
}

function wordCount(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function isSaneCard(card: LearningCard, topic: string) {
  if (wordCount(card.content) < 6 || wordCount(card.content) > 90) return false;
  if (card.detail && wordCount(card.detail) > 120) return false;
  if ((card.type === 'recall' || card.type === 'challenge') && !card.answer) return false;
  if (!LEARNING_TOPICS.test(topic) && GENERIC_STUDY_ADVICE.test(`${card.content} ${card.detail || ''}`)) return false;
  if (card.detail && textSimilarity(card.content, card.detail) >= .82) return false;
  if (card.sourceConfidence < .65) return false;
  return true;
}

export function parseGeneratedBatch(raw: unknown, input: GenerateRequest) {
  const parsed = GeneratedBatchSchema.parse(raw);
  if (normalizeText(parsed.topic) !== normalizeText(input.topic)) {
    throw new Error('Generated batch topic did not match the requested topic.');
  }
  if (parsed.level !== input.level) throw new Error('Generated batch level did not match the requested level.');

  const sane = parsed.cards.filter((card) => isSaneCard(card, input.topic));
  const unique = filterDuplicateCards(sane, input.previousCards as CompactCard[]);
  if (unique.length < 4) throw new Error('Generated batch did not contain enough valid, unique cards.');

  return unique.map((card) => ({
    ...card,
    id: `${normalizeText(input.topic).replace(/\s+/g, '-').slice(0, 35)}-${crypto.randomUUID()}`,
  }));
}

export function compactLearningCards(cards: LearningCard[]) {
  return cards.map((card) => compactCard(card));
}
