/**
 * LM Studio client — communiceert met de lokale LLM via Next.js API proxy.
 * De proxy voorkomt CORS-problemen en houdt het endpoint configureerbaar server-side.
 */

import { parseTileFromAiResponse, TILE_SYSTEM_PROMPT } from './tile-schema';

/** @typedef {{ role: 'user' | 'assistant' | 'system'; content: string }} ChatMessage */

/**
 * Genereert een tegel op basis van een natuurlijke-taal prompt.
 * @param {string} userPrompt
 * @param {ChatMessage[]} [history]
 * @returns {Promise<import('./tile-schema').GeneratedTileData extends infer T ? Omit<T, 'id' | 'createdAt'> : never>}
 */
export async function generateTileFromPrompt(userPrompt, history = []) {
  const messages = [
    { role: 'system', content: TILE_SYSTEM_PROMPT },
    ...history,
    { role: 'user', content: userPrompt },
  ];

  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message =
      typeof errorBody.error === 'string'
        ? errorBody.error
        : `AI-request mislukt (${response.status})`;
    throw new Error(message);
  }

  const data = await response.json();
  const content = data?.content;

  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Leeg antwoord ontvangen van AI.');
  }

  return parseTileFromAiResponse(content);
}
