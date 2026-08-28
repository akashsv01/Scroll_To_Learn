export type CardLike = {
  id?: string;
  type?: string;
  title?: string | null;
  content: string;
  detail?: string | null;
  answer?: string | null;
  tags?: string[];
};

export type CompactCard = {
  type: string;
  title: string;
  summary: string;
  tags: string[];
};

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'because', 'by', 'for', 'from',
  'has', 'have', 'in', 'into', 'is', 'it', 'its', 'of', 'on', 'or', 'that',
  'the', 'their', 'this', 'to', 'was', 'were', 'will', 'with', 'you', 'your',
]);

export function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function meaningfulTokens(value: string) {
  return new Set(normalizeText(value).split(' ').filter((word) => word.length > 2 && !STOP_WORDS.has(word)));
}

export function textSimilarity(left: string, right: string) {
  const a = meaningfulTokens(left);
  const b = meaningfulTokens(right);
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const token of a) if (b.has(token)) overlap += 1;
  return overlap / new Set([...a, ...b]).size;
}

export function compactCard(card: CardLike): CompactCard {
  const firstSentence = card.content.split(/(?<=[.!?])\s+/)[0] || card.content;
  return {
    type: card.type || 'fact',
    title: card.title || '',
    summary: firstSentence.slice(0, 180),
    tags: (card.tags || []).slice(0, 5),
  };
}

export function isDuplicateCard(card: CardLike, previous: Array<CardLike | CompactCard>) {
  const candidate = `${card.title || ''} ${card.content}`;
  return previous.some((item) => {
    const priorContent = 'summary' in item ? item.summary : item.content;
    const prior = 'summary' in item ? `${item.title} ${item.summary}` : `${item.title || ''} ${item.content}`;
    return normalizeText(card.content) === normalizeText(priorContent)
      || textSimilarity(card.content, priorContent) >= .78
      || normalizeText(candidate) === normalizeText(prior)
      || textSimilarity(candidate, prior) >= .72;
  });
}

export function filterDuplicateCards<T extends CardLike>(incoming: T[], previous: Array<CardLike | CompactCard>) {
  const accepted: T[] = [];
  for (const card of incoming) {
    if (!isDuplicateCard(card, [...previous, ...accepted])) accepted.push(card);
  }
  return accepted;
}

export function revealText(card: CardLike) {
  if ((card.type === 'recall' || card.type === 'challenge') && card.answer) return card.answer;
  return card.detail || '';
}

export function shouldPrefetch(totalCards: number, activeIndex: number, isFetching: boolean, remainingThreshold = 3) {
  return !isFetching && totalCards > 0 && totalCards - activeIndex <= remainingThreshold;
}

export function depthForHistory(historyCount: number, batchSize = 8) {
  return Math.max(1, Math.min(6, Math.floor(historyCount / batchSize) + 1));
}

export function createFeedReset(topic: string, level: 'beginner' | 'intermediate' | 'advanced', goal: string) {
  return {
    activeTopic: topic.trim(),
    activeLevel: level,
    activeGoal: goal.trim(),
    cards: [] as CardLike[],
    history: [] as CompactCard[],
    pairIndex: 0,
    stage: 'fact' as const,
    depth: 1,
  };
}
