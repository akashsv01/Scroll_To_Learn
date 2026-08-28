# Scroll to Learn

Scroll to Learn is a mobile-first microlearning app that combines a swipeable card feed with short quizzes and lightweight gamification. Enter any topic, choose a level, and Gemini generates a progressively deeper learning feed specifically for that subject.

No account or database is required. XP, streaks, the Review Deck, and other learner state are stored locally in the browser.

## Features

- Dynamic, topic-specific content for arbitrary topics
- Beginner, intermediate, and advanced difficulty levels
- Optional learning goal for more personalized cards
- Eight-card Gemini batches with automatic prefetching
- Facts, concepts, examples, misconceptions, recall prompts, challenges, tips, and comparisons
- Paired binary quizzes with immediate feedback and explanations
- Topic-specific answer and bonus-detail reveals
- Duplicate filtering and progressive feed depth
- Daily streaks, XP, combos, level-up celebrations, and milestones
- Locally persisted Review Deck
- Touch, pointer, and keyboard gesture support
- Honest retry/change-topic state when generation fails—no silent static fallback

## Gestures

### Learning cards

- Swipe up: continue to the paired quiz
- Swipe down: save to the Review Deck
- Swipe right: request more cards like this angle
- Swipe left: deprioritize this angle
- Tap: reveal the answer or bonus detail

### Quiz cards

- Swipe left: choose Option A
- Swipe right: choose Option B
- Swipe up: skip without a penalty
- Swipe down: save for later review

Keyboard users can perform the same actions with the arrow keys. Space or Enter reveals a card’s answer or detail.

## Generation flow

The browser sends one batched request containing:

- Selected topic
- Learner level
- Optional goal
- Current feed depth
- Liked and skipped subtopics
- Compact summaries of recent cards

The server validates the request with Zod and calls Gemini through Google’s official `@google/genai` SDK. Gemini returns structured JSON, which is validated again before rendering. Malformed, generic, low-confidence, overly long, and duplicate cards are rejected.

The API key is used only by the server and is never sent to browser code.

## Local setup

Requirements:

- Node.js 22.13 or newer
- A Gemini API key

From the repository root:

```bash
cd app
npm install
```

Create `app/.env.local` using `app/.env.example` as a template:

```env
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-3.6-flash
```

Do not place a real key in `.env.example` or commit `.env.local`.

Start the development server:

```bash
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Validation

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

The test suite covers topic propagation, structured response parsing, topic resets, duplicate filtering, recall-answer behavior, arbitrary topics, batch loading, prefetching, missing configuration, and provider failures.

## Technology

- Next.js 16 (App Router) and React 19
- TypeScript
- Gemini via `@google/genai`
- Zod structured-output validation
- Vitest
- Browser `localStorage` for learner progress

## Deploying to Vercel

Import this repository in Vercel and use these settings:

- Application Preset: **Next.js**
- Root Directory: **`app`**
- Build Command: leave the Next.js default (`npm run build`)
- Output Directory: leave blank (Next.js default)
- Install Command: leave the default (`npm install`)

Add these environment variables in Vercel before deploying:

```env
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-3.6-flash
```

`GEMINI_API_KEY` is required. `GEMINI_MODEL` is optional and defaults to `gemini-3.6-flash`. Vercel runs the server-side `/api/generate` route, so the Gemini key remains private and is never included in the browser bundle.

## Project structure

```text
app/
├── app/
│   ├── api/generate/route.ts  # Server-side Gemini generation endpoint
│   ├── globals.css            # Mobile-first card and gesture styling
│   ├── layout.tsx             # Metadata and viewport configuration
│   └── page.tsx               # Feed, gestures, quizzes, and local state
├── lib/
│   ├── feed.ts                # Feed reset, history, and duplicate helpers
│   └── learning.ts            # Schemas, prompts, and content validation
└── tests/
    └── learning.test.ts       # Generation-pipeline tests
```
