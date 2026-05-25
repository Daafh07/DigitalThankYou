/**
 * LM Studio client — communiceert met de lokale LLM via Next.js API proxy.
 */

import {
  attachLogoAssetsToTile,
  buildTileUserPrompt,
  createLogoTileFallback,
  parseTileFromAiResponse,
  TILE_SYSTEM_PROMPT,
} from './tile-schema';

/** @typedef {{ role: 'user' | 'assistant' | 'system'; content: string }} ChatMessage */

/**
 * @typedef {Object} GenerateTileOptions
 * @property {ChatMessage[]} [history]
 * @property {string} [logoBlue]
 * @property {string} [tileTexture]
 * @property {string} [logoFileName]
 */

/**
 * @param {Omit<import('./tile-schema').GeneratedTileData, 'id' | 'createdAt'>} payload
 * @param {GenerateTileOptions} options
 */
function withLogoAssets(payload, options) {
  attachLogoAssetsToTile(payload, {
    logoBlue: options.logoBlue,
    tileTexture: options.tileTexture,
  });
  return payload;
}

/**
 * Genereert een tegel op basis van een natuurlijke-taal prompt.
 * @param {string} userPrompt
 * @param {GenerateTileOptions} [options]
 */
export async function generateTileFromPrompt(userPrompt, options = {}) {
  const {
    history = [],
    logoBlue,
    tileTexture,
    logoFileName = '',
  } = options;
  const hasLogo = Boolean(logoBlue && tileTexture);

  if (!userPrompt.trim() && !hasLogo) {
    throw new Error('Voer een beschrijving in of upload een logo.');
  }

  const messages = [
    { role: 'system', content: TILE_SYSTEM_PROMPT },
    ...history,
    { role: 'user', content: buildTileUserPrompt(userPrompt, hasLogo) },
  ];

  try {
    const response = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    });

    if (!response.ok) {
      throw new Error(await readApiError(response));
    }

    const data = await response.json();
    const content = data?.content;

    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('Leeg antwoord ontvangen van AI.');
    }

    try {
      const payload = parseTileFromAiResponse(content);
      return withLogoAssets(payload, options);
    } catch (parseError) {
      if (!hasLogo) throw parseError;
      const fallback = createLogoTileFallback({
        prompt: userPrompt,
        fileName: logoFileName,
      });
      return withLogoAssets(fallback, options);
    }
  } catch (error) {
    if (!hasLogo) throw error;

    const fallback = createLogoTileFallback({
      prompt: userPrompt,
      fileName: logoFileName,
    });
    return withLogoAssets(fallback, options);
  }
}

/**
 * @param {Response} response
 */
async function readApiError(response) {
  const errorBody = await response.json().catch(() => ({}));
  if (typeof errorBody.error === 'string') return errorBody.error;
  return `AI-request mislukt (${response.status})`;
}
