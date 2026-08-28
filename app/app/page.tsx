'use client';

import {
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  compactCard,
  createFeedReset,
  depthForHistory,
  filterDuplicateCards,
  revealText,
  shouldPrefetch,
  type CompactCard,
} from '../lib/feed';
import type { LearningCard, Level } from '../lib/learning';

type Choice = 'A' | 'B';
type Direction = 'left' | 'right' | 'up' | 'down';
type CardKind = 'fact' | 'quiz';
type Mode = 'landing' | 'feed' | 'review';

type Profile = {
  xp: number;
  streak: number;
  lastVisit: string;
  combo: number;
  learnedToday: number;
  learnedDate: string;
};

type AnswerResult = {
  correct: boolean;
  selection: Choice;
  explanation: string;
};

type Reactions = { liked: string[]; skipped: string[] };

const TOPICS = [
  'Roman Empire',
  'Python Basics',
  'Astrophysics',
  'World Geography',
  'Human Body',
  'Startup Fundamentals',
];

const PALETTE = ['#31125e', '#153d3b', '#4a173a', '#143252', '#3d2815', '#29204f'];
const DEFAULT_PROFILE: Profile = {
  xp: 0,
  streak: 0,
  lastVisit: '',
  combo: 0,
  learnedToday: 0,
  learnedDate: '',
};

function localDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function yesterdayDate() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return localDate(date);
}

function safeParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function migrateSavedCards(value: unknown): LearningCard[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const card = item as Record<string, unknown>;
    if (typeof card.content === 'string' && card.quiz) return [card as unknown as LearningCard];
    if (typeof card.fact !== 'string' || !card.quiz) return [];
    return [{
      id: String(card.id || crypto.randomUUID()),
      type: 'fact' as const,
      title: String(card.subtopic || 'Saved fact'),
      content: card.fact,
      detail: typeof card.bonus === 'string' ? card.bonus : null,
      difficulty: 1,
      tags: [String(card.subtopic || 'saved')],
      answer: null,
      sourceConfidence: 1,
      quiz: card.quiz as LearningCard['quiz'],
    }];
  });
}

function SwipeCard({
  data,
  kind,
  color,
  topic,
  answerResult,
  onSwipe,
}: {
  data: LearningCard;
  kind: CardKind;
  color: string;
  topic: string;
  answerResult: AnswerResult | null;
  onSwipe: (direction: Direction) => void;
}) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const origin = useRef({ x: 0, y: 0 });
  const pointerId = useRef<number | null>(null);
  const moved = useRef(0);
  const threshold = 92;
  const reveal = revealText(data);

  const directionFromOffset = useCallback((x: number, y: number): Direction => {
    if (Math.abs(x) > Math.abs(y)) return x < 0 ? 'left' : 'right';
    return y < 0 ? 'up' : 'down';
  }, []);

  const commit = useCallback((direction: Direction) => {
    if (answerResult || exiting) return;
    const holdsForAnswer = kind === 'quiz' && (direction === 'left' || direction === 'right');
    setDragging(false);

    if (holdsForAnswer) {
      setOffset({ x: 0, y: 0 });
      onSwipe(direction);
      return;
    }

    const distance = typeof window === 'undefined' ? 900 : Math.max(window.innerWidth, window.innerHeight) * 1.2;
    const target = {
      left: { x: -distance, y: offset.y * .35 },
      right: { x: distance, y: offset.y * .35 },
      up: { x: offset.x * .35, y: -distance },
      down: { x: offset.x * .35, y: distance },
    }[direction];
    setExiting(true);
    setOffset(target);
    window.setTimeout(() => onSwipe(direction), 230);
  }, [answerResult, exiting, kind, offset.x, offset.y, onSwipe]);

  function onPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (answerResult || exiting) return;
    pointerId.current = event.pointerId;
    origin.current = { x: event.clientX, y: event.clientY };
    moved.current = 0;
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLElement>) {
    if (!dragging || pointerId.current !== event.pointerId) return;
    const x = event.clientX - origin.current.x;
    const y = event.clientY - origin.current.y;
    moved.current = Math.max(moved.current, Math.hypot(x, y));
    setOffset({ x, y });
  }

  function onPointerUp(event: ReactPointerEvent<HTMLElement>) {
    if (!dragging || pointerId.current !== event.pointerId) return;
    pointerId.current = null;
    setDragging(false);
    const dominant = Math.max(Math.abs(offset.x), Math.abs(offset.y));

    if (dominant >= threshold) {
      commit(directionFromOffset(offset.x, offset.y));
    } else {
      setOffset({ x: 0, y: 0 });
      if (moved.current < 8 && kind === 'fact' && reveal) setFlipped((value) => !value);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    const keyDirections: Record<string, Direction> = {
      ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
    };
    const direction = keyDirections[event.key];
    if (direction) {
      event.preventDefault();
      commit(direction);
    } else if ((event.key === ' ' || event.key === 'Enter') && kind === 'fact' && reveal) {
      event.preventDefault();
      setFlipped((value) => !value);
    }
  }

  const dominant = Math.max(Math.abs(offset.x), Math.abs(offset.y));
  const activeDirection = dominant > threshold * .4 ? directionFromOffset(offset.x, offset.y) : null;
  const labels: Record<CardKind, Record<Direction, string>> = {
    fact: { left: 'SKIP THIS ANGLE', right: 'MORE LIKE THIS', up: 'CONTINUE', down: 'SAVE FOR REVIEW' },
    quiz: { left: 'LOCK IN A', right: 'LOCK IN B', up: 'NOT SURE', down: 'REVIEW LATER' },
  };
  const transform = `translate3d(${offset.x}px, ${offset.y}px, 0) rotate(${Math.max(-9, Math.min(9, offset.x / 24))}deg)`;
  const feedbackClass = answerResult ? `feedback ${answerResult.correct ? 'correct' : 'incorrect'}` : '';

  return (
    <article
      className={`gesture-card ${kind}-card ${feedbackClass} ${dragging ? 'dragging' : ''} ${exiting ? 'exiting' : ''}`}
      style={{ backgroundColor: color, transform }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      tabIndex={0}
      role="group"
      aria-label={kind === 'fact' ? `${data.type} about ${topic}` : `Quiz: ${data.quiz.question}`}
    >
      {activeDirection && !answerResult && (
        <span className={`drag-label ${activeDirection}`}>{labels[kind][activeDirection]}</span>
      )}

      {kind === 'fact' ? (
        <div className={`flip-shell ${flipped ? 'is-flipped' : ''}`}>
          <section className="card-face front">
            <header className="card-kicker">
              <span>{data.type.toUpperCase()} · L{data.difficulty}</span>
              <span>{topic}</span>
            </header>
            <div className="fact-copy-wrap">
              {data.title && <p className="fact-title">{data.title}</p>}
              <div className="fact-copy">{data.content}</div>
            </div>
            {reveal && (
              <footer className="card-foot">
                <span className="tap-orbit">↻</span>
                <span>{data.type === 'recall' || data.type === 'challenge' ? 'TAP TO REVEAL THE ANSWER' : 'TAP FOR A BONUS DETAIL'}</span>
              </footer>
            )}
          </section>
          <section className="card-face back" aria-hidden={!flipped}>
            <p className="bonus-label">{data.type === 'recall' || data.type === 'challenge' ? 'THE ANSWER' : 'A LITTLE DEEPER'}</p>
            <p>{reveal}</p>
            <span>TAP TO FLIP BACK</span>
          </section>
        </div>
      ) : (
        <section className="quiz-content">
          <header className="card-kicker">
            <span>QUICK CHECK</span>
            <span>{topic}</span>
          </header>
          <h2>{data.quiz.question}</h2>
          <div className="quiz-options" aria-label="Swipe left for A or right for B">
            <div className={`quiz-option option-a ${answerResult?.selection === 'A' ? 'chosen' : ''}`}>
              <span className="option-letter">A</span>
              <p>{data.quiz.optionA}</p>
              <small>← SWIPE LEFT</small>
            </div>
            <div className={`quiz-option option-b ${answerResult?.selection === 'B' ? 'chosen' : ''}`}>
              <span className="option-letter">B</span>
              <p>{data.quiz.optionB}</p>
              <small>SWIPE RIGHT →</small>
            </div>
          </div>
          {answerResult && (
            <div className="answer-panel" role="status" aria-live="polite">
              <strong>{answerResult.correct ? 'NAILED IT' : 'ALMOST!'}</strong>
              <p>{answerResult.explanation}</p>
            </div>
          )}
        </section>
      )}
    </article>
  );
}

export default function Home() {
  const [mode, setMode] = useState<Mode>('landing');
  const [topic, setTopic] = useState('');
  const [learningLevel, setLearningLevel] = useState<Level>('beginner');
  const [goal, setGoal] = useState('');
  const [activeTopic, setActiveTopic] = useState('');
  const [activeLevel, setActiveLevel] = useState<Level>('beginner');
  const [activeGoal, setActiveGoal] = useState('');
  const [depth, setDepth] = useState(1);
  const [cards, setCards] = useState<LearningCard[]>([]);
  const [pairIndex, setPairIndex] = useState(0);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [stage, setStage] = useState<CardKind>('fact');
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [savedCards, setSavedCards] = useState<LearningCard[]>([]);
  const [reactions, setReactions] = useState<Reactions>({ liked: [], skipped: [] });
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [answerResult, setAnswerResult] = useState<AnswerResult | null>(null);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [levelUp, setLevelUp] = useState(false);
  const [milestone, setMilestone] = useState(0);
  const [comboMessage, setComboMessage] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const fetching = useRef(false);
  const milestonePending = useRef(0);
  const generationController = useRef<AbortController | null>(null);
  const sessionId = useRef(0);
  const historyRef = useRef<CompactCard[]>([]);
  const activeContextRef = useRef({ topic: '', level: 'beginner' as Level, goal: '' });
  const reactionsRef = useRef(reactions);

  useEffect(() => { reactionsRef.current = reactions; }, [reactions]);

  useEffect(() => {
    const today = localDate();
    const savedProfile = safeParse<Profile>(localStorage.getItem('stl_profile'), DEFAULT_PROFILE);
    const nextProfile = { ...DEFAULT_PROFILE, ...savedProfile };
    if (nextProfile.lastVisit !== today) {
      nextProfile.streak = nextProfile.lastVisit === yesterdayDate() ? Math.max(1, nextProfile.streak + 1) : 1;
      nextProfile.lastVisit = today;
    }
    if (nextProfile.learnedDate !== today) {
      nextProfile.learnedToday = 0;
      nextProfile.learnedDate = today;
    }
    // Local storage is the app's source of truth after the first client render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProfile(nextProfile);
    setSavedCards(migrateSavedCards(safeParse<unknown>(localStorage.getItem('stl_review'), [])));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem('stl_profile', JSON.stringify(profile));
  }, [profile, hydrated]);
  useEffect(() => {
    if (hydrated) localStorage.setItem('stl_review', JSON.stringify(savedCards));
  }, [savedCards, hydrated]);
  const fetchBatch = useCallback(async (
    context: { topic: string; level: Level; goal: string },
    first = false,
    session = sessionId.current,
  ) => {
    if (!context.topic || fetching.current) return;
    fetching.current = true;
    if (first) setLoading(true);
    setLoadError('');
    const controller = new AbortController();
    generationController.current = controller;
    const requestDepth = depthForHistory(historyRef.current.length);
    setDepth(requestDepth);
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          topic: context.topic,
          level: context.level,
          goal: context.goal,
          previousCards: historyRef.current.slice(-32),
          likedSubtopics: reactionsRef.current.liked.slice(-12),
          skippedSubtopics: reactionsRef.current.skipped.slice(-12),
          depth: requestDepth,
        }),
      });
      const payload = await response.json().catch(() => ({})) as { cards?: LearningCard[]; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Couldn’t generate new cards right now.');
      if (session !== sessionId.current) return;
      const incoming = (payload.cards || []).filter((card) => card.content && card.quiz?.question);
      if (!incoming.length) throw new Error('No cards returned');
      const unique = filterDuplicateCards(incoming, historyRef.current);
      if (!unique.length) throw new Error('The new batch repeated cards you already saw. Please retry.');
      historyRef.current = [...historyRef.current, ...unique.map(compactCard)].slice(-32);
      setCards((current) => [...current, ...filterDuplicateCards(unique, current)]);
    } catch (error) {
      if (controller.signal.aborted || session !== sessionId.current) return;
      setLoadError(error instanceof Error ? error.message : 'Couldn’t generate new cards right now.');
    } finally {
      if (session === sessionId.current) {
        fetching.current = false;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (mode !== 'feed' || !activeTopic || !shouldPrefetch(cards.length, pairIndex, fetching.current)) return;
    const timer = window.setTimeout(() => void fetchBatch(activeContextRef.current), 0);
    return () => window.clearTimeout(timer);
  }, [mode, activeTopic, cards.length, pairIndex, fetchBatch]);

  function addXp(amount: number) {
    setProfile((current) => {
      const nextXp = current.xp + amount;
      if (Math.floor(nextXp / 100) > Math.floor(current.xp / 100)) {
        setLevelUp(true);
        window.setTimeout(() => setLevelUp(false), 2200);
      }
      return { ...current, xp: nextXp };
    });
  }

  async function startLearning(topicName = topic) {
    const cleanTopic = topicName.trim();
    if (!cleanTopic) return;
    generationController.current?.abort();
    sessionId.current += 1;
    fetching.current = false;
    const session = sessionId.current;
    const reset = createFeedReset(cleanTopic, learningLevel, goal);
    const context = { topic: reset.activeTopic, level: reset.activeLevel, goal: reset.activeGoal };
    activeContextRef.current = context;
    historyRef.current = [];
    reactionsRef.current = { liked: [], skipped: [] };
    setReactions({ liked: [], skipped: [] });
    setActiveTopic(reset.activeTopic);
    setActiveLevel(reset.activeLevel);
    setActiveGoal(reset.activeGoal);
    setTopic(cleanTopic);
    setCards([]);
    setPairIndex(reset.pairIndex);
    setStage(reset.stage);
    setDepth(reset.depth);
    setAnswerResult(null);
    setLoadError('');
    setMode('feed');
    if (localStorage.getItem('stl_tutorial_seen') !== 'true') setTutorialOpen(true);
    await fetchBatch(context, true, session);
  }

  function closeTutorial() {
    localStorage.setItem('stl_tutorial_seen', 'true');
    setTutorialOpen(false);
  }

  function saveForReview(card: LearningCard) {
    setSavedCards((current) => current.some((saved) => saved.id === card.id) ? current : [...current, card]);
  }

  function addReaction(kind: keyof Reactions, angle: string) {
    setReactions((current) => ({ ...current, [kind]: [...current[kind], angle].slice(-20) }));
  }

  function finishPair() {
    setAnswerResult(null);
    setStage('fact');
    if (mode === 'review') {
      setReviewIndex((index) => savedCards.length ? (index + 1) % savedCards.length : 0);
    } else {
      setPairIndex((index) => index + 1);
    }
    if (milestonePending.current) {
      setMilestone(milestonePending.current);
      milestonePending.current = 0;
    }
  }

  function handleSwipe(direction: Direction) {
    const current = mode === 'review' ? savedCards[reviewIndex] : cards[pairIndex];
    if (!current || answerResult) return;

    if (stage === 'fact') {
      addXp(2);
      if (direction === 'down') saveForReview(current);
      const angle = current.title || current.tags[0] || current.type;
      if (direction === 'right') addReaction('liked', angle);
      if (direction === 'left') addReaction('skipped', angle);
      setProfile((value) => {
        const learnedToday = value.learnedToday + 1;
        if (learnedToday % 10 === 0) milestonePending.current = learnedToday;
        return { ...value, learnedToday };
      });
      setStage('quiz');
      return;
    }

    if (direction === 'left' || direction === 'right') {
      const selection: Choice = direction === 'left' ? 'A' : 'B';
      const correct = selection === current.quiz.correct;
      setAnswerResult({ correct, selection, explanation: current.quiz.explanation });
      if (correct) {
        addXp(10);
        setProfile((value) => ({ ...value, combo: value.combo + 1 }));
      } else {
        setProfile((value) => ({ ...value, combo: 0 }));
        setComboMessage('Fresh start — the next one’s yours.');
        window.setTimeout(() => setComboMessage(''), 1900);
      }
      window.setTimeout(finishPair, 1500);
    } else {
      if (direction === 'down') saveForReview(current);
      finishPair();
    }
  }

  function openReview() {
    if (!savedCards.length) return;
    setReviewIndex(0);
    setStage('fact');
    setAnswerResult(null);
    setMode('review');
  }

  const activeCard = mode === 'review' ? savedCards[reviewIndex] : cards[pairIndex];
  const xpProgress = profile.xp % 100;
  const level = Math.floor(profile.xp / 100) + 1;

  if (mode === 'landing') {
    return (
      <main className="landing-shell">
        <nav className="landing-nav" aria-label="Scroll to Learn">
          <a className="brand" href="#top" aria-label="Scroll to Learn home">
            <span className="brand-mark">S</span><span>SCROLL TO LEARN</span>
          </a>
          {(profile.xp > 0 || profile.streak > 0) && (
            <div className="returning-stats" aria-label="Your learning stats">
              <span>🔥 {profile.streak}</span><span>⚡ {profile.xp} XP</span>
            </div>
          )}
        </nav>

        <section className="landing-content" id="top">
          <p className="eyebrow"><span /> LEARN SOMETHING NEW</p>
          <h1>What are you<br />curious about?</h1>
          <p className="landing-copy">Pick a topic. Swipe through bite-sized lessons.<br className="desktop-break" /> Get smarter, one card at a time.</p>
          <form className="topic-form" onSubmit={(event) => { event.preventDefault(); void startLearning(); }}>
            <label htmlFor="topic">What do you want to learn today?</label>
            <div className="input-wrap"><span aria-hidden="true">⌕</span>
              <input id="topic" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="e.g. The Roman Empire" autoComplete="off" maxLength={100} />
            </div>
            <p className="or-pick">OR PICK A TOPIC</p>
            <div className="topic-chips">
              {TOPICS.map((item) => <button type="button" key={item} className={topic === item ? 'selected' : ''} onClick={() => setTopic(item)}>{item}</button>)}
            </div>
            <div className="learning-options">
              <fieldset className="level-picker">
                <legend>YOUR LEVEL</legend>
                <div>
                  {(['beginner', 'intermediate', 'advanced'] as Level[]).map((item) => (
                    <button type="button" key={item} className={learningLevel === item ? 'selected' : ''} onClick={() => setLearningLevel(item)}>{item}</button>
                  ))}
                </div>
              </fieldset>
              <label className="goal-field" htmlFor="goal">
                <span>OPTIONAL GOAL</span>
                <input id="goal" value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="e.g. Improve positional play" maxLength={200} />
              </label>
            </div>
            <button className="start-button" type="submit" disabled={!topic.trim()}>START SCROLLING <span>→</span></button>
          </form>
        </section>
        <footer className="landing-footer"><span><i /> NO ACCOUNT NEEDED</span><span>YOUR PROGRESS STAYS ON THIS DEVICE</span></footer>
      </main>
    );
  }

  return (
    <main className="feed-shell">
      <header className="top-bar">
        <button className="icon-button home-button" onClick={() => setMode('landing')} aria-label="Back to topics">S</button>
        <div className="streak-stat" title="Daily streak"><span>🔥</span><strong>{profile.streak}</strong></div>
        <div className="xp-stat" aria-label={`${profile.xp} experience points, level ${level}`}>
          <div><span>LVL {level}</span><strong>{profile.xp} XP</strong></div>
          <i><b style={{ width: `${xpProgress}%` }} /></i>
        </div>
        {profile.combo > 1 && <div className="combo-stat">×{profile.combo} COMBO</div>}
        <button className={`review-button ${savedCards.length ? '' : 'empty'}`} onClick={openReview} aria-label={`Open Review Deck, ${savedCards.length} saved`}>
          <span aria-hidden="true">▱</span><em>REVIEW</em><b>{savedCards.length}</b>
        </button>
      </header>

      <section className="feed-stage" aria-label={mode === 'review' ? 'Review Deck' : `${activeTopic} learning feed`}>
        <div className="feed-heading">
          <span>{mode === 'review' ? 'REVIEW DECK' : `${activeTopic.toUpperCase()} · ${activeLevel.toUpperCase()}`}</span>
          <small>{stage === 'fact' ? `DEPTH ${depth} · READ THEN SWIPE` : 'CHOOSE WITH A SWIPE'}</small>
        </div>
        <div className="card-stack" aria-busy={loading}>
          {activeCard && <div className="stack-card back-two" style={{ backgroundColor: PALETTE[(pairIndex + 2) % PALETTE.length] }} />}
          {activeCard && <div className="stack-card back-one" style={{ backgroundColor: PALETTE[(pairIndex + 1) % PALETTE.length] }} />}
          {activeCard && (
            <SwipeCard
              key={`${mode}-${activeCard.id}-${stage}-${reviewIndex}-${pairIndex}`}
              data={activeCard}
              kind={stage}
              color={PALETTE[(mode === 'review' ? reviewIndex : pairIndex) % PALETTE.length]}
              topic={activeTopic}
              answerResult={answerResult}
              onSwipe={handleSwipe}
            />
          )}
          {loading && !activeCard && (
            <div className="loading-card" role="status"><span className="loading-orbit">S</span><h2>Building your {activeTopic} feed…</h2><p>{depth > 1 ? 'Going one level deeper.' : activeGoal ? `Tailoring the first concepts to: ${activeGoal}` : 'Finding the first high-value concepts.'}</p><div className="skeleton-lines" aria-hidden="true"><i /><i /><i /></div></div>
          )}
          {!loading && !activeCard && (
            <div className="loading-card error-card" role="status"><span>↻</span><h2>Couldn’t generate new cards right now.</h2><p>{loadError || 'The lesson generator took a pause.'}</p><div className="error-actions"><button onClick={() => void fetchBatch(activeContextRef.current, true)}>RETRY</button><button className="secondary-action" onClick={() => setMode('landing')}>CHANGE TOPIC</button></div></div>
          )}
        </div>
        <p className="gesture-legend">← SKIP / A <span>↓ SAVE</span> <span>↑ CONTINUE</span> MORE / B →</p>
      </section>

      {tutorialOpen && (
        <div className="overlay tutorial-overlay" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
          <div className="tutorial-card">
            <p className="eyebrow"><span /> ONE-TIME TOUR</p>
            <h2 id="tutorial-title">Your thumb<br />is the teacher.</h2>
            <div className="tutorial-map">
              <div className="tutorial-up"><b>↑</b><span>CONTINUE</span><small>or “not sure” on quizzes</small></div>
              <div className="tutorial-left"><b>←</b><span>SKIP / OPTION A</span></div>
              <div className="tutorial-center"><strong>TAP</strong><span>bonus detail</span></div>
              <div className="tutorial-right"><b>→</b><span>MORE / OPTION B</span></div>
              <div className="tutorial-down"><b>↓</b><span>SAVE TO REVIEW</span></div>
            </div>
            <button onClick={closeTutorial}>GOT IT — LET’S SWIPE</button>
          </div>
        </div>
      )}

      {levelUp && (
        <div className="level-up" role="status" aria-live="assertive">
          <div className="confetti" aria-hidden="true">✦ <span>●</span> ◆ <i>✦</i> ●</div>
          <small>100 XP EARNED</small><strong>LEVEL UP!</strong><span>YOU’RE ON A ROLL ⚡</span>
        </div>
      )}

      {milestone > 0 && (
        <div className="overlay milestone-overlay" role="dialog" aria-modal="true" aria-labelledby="milestone-title">
          <div><span className="milestone-burst">✦</span><p>{milestone} THINGS LEARNED TODAY</p><h2 id="milestone-title">Look at that<br />brain go. 🎉</h2><small>You’ve learned {milestone} things about {activeTopic} today.</small><button onClick={() => setMilestone(0)}>KEEP SCROLLING →</button></div>
        </div>
      )}

      {comboMessage && <div className="gentle-toast" role="status">{comboMessage}</div>}
    </main>
  );
}
