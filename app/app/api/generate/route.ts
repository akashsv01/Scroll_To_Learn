import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import {
  GenerateRequestSchema,
  GeneratedBatchSchema,
  SYSTEM_INSTRUCTION,
  createUserPrompt,
  parseGeneratedBatch,
  type GenerateRequest,
  type LearningCard,
} from '../../../lib/learning';

type GenerateCards = (input: GenerateRequest, apiKey: string) => Promise<LearningCard[]>;

export async function generateWithGemini(input: GenerateRequest, apiKey: string) {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
    contents: createUserPrompt(input),
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      temperature: .7,
      maxOutputTokens: 7000,
      responseMimeType: 'application/json',
      responseJsonSchema: z.toJSONSchema(GeneratedBatchSchema),
    },
  });

  const text = response.text;
  if (!text) throw new Error('Gemini returned an empty response.');
  return parseGeneratedBatch(JSON.parse(text), input);
}

export function createPostHandler(dependencies?: {
  getApiKey?: () => string | undefined;
  generateCards?: GenerateCards;
}) {
  const getApiKey = dependencies?.getApiKey || (() => process.env.GEMINI_API_KEY);
  const generateCards = dependencies?.generateCards || generateWithGemini;

  return async function POST(request: Request) {
    const raw = await request.json().catch(() => null);
    const parsed = GenerateRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json({ error: 'The generation request was invalid.' }, { status: 400 });
    }

    const apiKey = getApiKey();
    if (!apiKey) {
      return Response.json({
        error: 'AI generation is not configured yet.',
        code: 'GEMINI_NOT_CONFIGURED',
      }, { status: 503 });
    }

    try {
      const cards = await generateCards(parsed.data, apiKey);
      return Response.json({
        topic: parsed.data.topic,
        level: parsed.data.level,
        depth: parsed.data.depth,
        cards,
        source: 'gemini',
      });
    } catch (error) {
      console.error('Gemini card generation failed.', error);
      return Response.json({
        error: 'Couldn’t generate new cards right now.',
        code: 'GENERATION_FAILED',
      }, { status: 502 });
    }
  };
}

export const POST = createPostHandler();
