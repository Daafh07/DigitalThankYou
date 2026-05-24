/**
 * API route — proxy naar LM Studio lokale chat/completions endpoint.
 * Endpoint: http://127.0.0.1:1234/v1/chat/completions
 */

import { NextResponse } from 'next/server';
import { TILE_SYSTEM_PROMPT } from '@/lib/ai/tile-schema';

const LM_STUDIO_URL =
  process.env.LM_STUDIO_URL ?? 'http://127.0.0.1:1234/v1/chat/completions';

const DEFAULT_MODEL = process.env.LM_STUDIO_MODEL ?? 'local-model';

export async function POST(request) {
  try {
    const body = await request.json();
    const messages = Array.isArray(body?.messages) ? body.messages : [];

    const lmResponse = await fetch(LM_STUDIO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: messages.length
          ? messages
          : [{ role: 'system', content: TILE_SYSTEM_PROMPT }],
        temperature: 0.4,
        max_tokens: 1024,
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
