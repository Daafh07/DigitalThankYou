/**
 * API route — proxy naar LM Studio lokale chat/completions endpoint.
 * Endpoint: http://127.0.0.1:1234/v1/chat/completions
 */

import { NextResponse } from 'next/server';
import {
  buildTileSystemPrompt,
  LM_STUDIO_GENERATION,
} from '@/lib/ai/lm-studio';

const LM_STUDIO_URL =
  process.env.LM_STUDIO_URL ?? 'http://127.0.0.1:1234/v1/chat/completions';

const DEFAULT_MODEL = process.env.LM_STUDIO_MODEL ?? 'local-model';

export async function POST(request) {
  try {
    const body = await request.json();
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const generation =
      body?.generation && typeof body.generation === 'object'
        ? body.generation
        : LM_STUDIO_GENERATION;

    const temperature =
      typeof generation.temperature === 'number'
        ? generation.temperature
        : LM_STUDIO_GENERATION.temperature;
    const max_tokens =
      typeof generation.max_tokens === 'number'
        ? generation.max_tokens
        : LM_STUDIO_GENERATION.max_tokens;

    const lmResponse = await fetch(LM_STUDIO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: messages.length
          ? messages
          : [{ role: 'system', content: buildTileSystemPrompt() }],
        temperature,
        max_tokens,
        stream: false,
      }),
    });

    if (!lmResponse.ok) {
      const errorText = await lmResponse.text();
      return NextResponse.json(
        {
          error: `LM Studio niet bereikbaar (${lmResponse.status}). Zorg dat LM Studio draait op poort 1234.`,
          details: errorText.slice(0, 300),
        },
        { status: 502 },
      );
    }

    const data = await lmResponse.json();
    const content = data?.choices?.[0]?.message?.content ?? '';

    return NextResponse.json({ content });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Onbekende serverfout';

    return NextResponse.json(
      {
        error: `Verbinding met LM Studio mislukt. Start LM Studio en controleer http://127.0.0.1:1234`,
        details: message,
      },
      { status: 500 },
    );
  }
}
