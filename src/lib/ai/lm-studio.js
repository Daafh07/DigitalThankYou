/**
 * LM Studio client — communiceert met de lokale LLM via Next.js API proxy.
 *
 * Pas LM_STUDIO_RULES en LM_STUDIO_GENERATION hieronder aan om te sturen
 * hoe het model tegels genereert.
 */

import {
  attachLogoAssetsToTile,
  buildTileUserPrompt,
  createLogoTileFallback,
  parseTileFromAiResponse,
  TILE_JSON_SCHEMA,
} from "./tile-schema";

// ─── Regels — pas aan naar wens ─────────────────────────────────────────────

/** @typedef {Object} LmStudioRules
 * @property {string} persona — Wie het model is / waar het voor werkt
 * @property {string[]} rules — Volledige zinnen die het gedrag van het model sturen
 */

/** @type {LmStudioRules} */
export const LM_STUDIO_RULES = {
  persona:
    "Je bent een UI-generator voor Digital Thank You — een digitale bedankmuur waar partnerlogo's in Delft-blauw op tegels verschijnen.",

  rules: [
    "Antwoord uitsluitend met één JSON-object, zonder markdown, uitleg of codeblokken — en zonder enige tekst buiten dat object.",
    "Schrijf title, subtitle en description in het Nederlands, tenzij de gebruiker expliciet een andere taal vraagt.",
    "Geef altijd een title mee die kort en herkenbaar is, met maximaal ongeveer zes woorden.",
    "Houd subtitle en description warm en professioneel, passend bij een partnership-bedankmuur.",
    "Beperk de description tot maximaal twee korte zinnen.",
    "Vul buttonText alleen in wanneer de gebruiker om een actie of knop vraagt.",
    "Kies style.theme, style.accent en style.size passend bij wat de gebruiker beschrijft.",
    'Kies bij twijfel theme "dark", accent "blue" en size "medium", omdat dat aansluit bij de Delft-blauwe huisstijl.',
    'Gebruik accent "blue" voor partner- en bedanktegels, tenzij de prompt duidelijk om een andere sfeer vraagt.',
    'Wanneer de gebruiker een logo heeft geüpload, laat je het veld "image" leeg — het logo staat al op de tegel in Delft-blauw.',
    "Richt je in dat geval op een passende title, een optionele subtitle en een korte description.",
    'Wanneer er geen logo is geüpload en de tegel een bestaande afbeelding nodig heeft, kies je één van deze paden voor "image": /assets/figma/livewall-room.png, /assets/figma/newLogo.svg of /assets/figma/interstitial-building.png.',
    "Het jaartal kiest de gebruiker apart in de chat; vermeld jaar niet in het JSON-object.",
  ],
};

/** Generatie-parameters naar LM Studio (via /api/ai). */
export const LM_STUDIO_GENERATION = {
  temperature: 0.4,
  max_tokens: 1024,
};

/**
 * Bouwt het system prompt uit LM_STUDIO_RULES + JSON-schema.
 * @returns {string}
 */
export function buildTileSystemPrompt() {
  const { persona, rules } = LM_STUDIO_RULES;
  return [
    persona,
    "",
    "Je antwoordt uitsluitend met geldig JSON volgens onderstaand schema.",
    "",
    TILE_JSON_SCHEMA,
    "",
    "Regels:",
    ...rules.map((rule) => `- ${rule}`),
  ].join("\n");
}

// ─── Client ─────────────────────────────────────────────────────────────────

/** @typedef {{ role: 'user' | 'assistant' | 'system'; content: string }} ChatMessage */

/**
 * @typedef {Object} GenerateTileOptions
 * @property {ChatMessage[]} [history]
 * @property {string} [logoBlue]
 * @property {string} [tileTexture]
 * @property {string} [logoFileName]
 * @property {import('@/lib/tile-year').TileYear} [year]
 */

/**
 * @param {Omit<import('./tile-schema').GeneratedTileData, 'id' | 'createdAt'>} payload
 * @param {GenerateTileOptions} options
 */
function finalizeTilePayload(payload, options) {
  attachLogoAssetsToTile(payload, {
    logoBlue: options.logoBlue,
    tileTexture: options.tileTexture,
  });
  if (options.year) payload.year = options.year;
  return payload;
}

/**
 * Genereert een tegel op basis van een natuurlijke-taal prompt.
 * @param {string} userPrompt
 * @param {GenerateTileOptions} [options]
 */
export async function generateTileFromPrompt(userPrompt, options = {}) {
  const { history = [], logoBlue, tileTexture, logoFileName = "" } = options;
  const hasLogo = Boolean(logoBlue && tileTexture);

  if (!userPrompt.trim() && !hasLogo) {
    throw new Error("Voer een beschrijving in of upload een logo.");
  }

  const messages = [
    { role: "system", content: buildTileSystemPrompt() },
    ...history,
    { role: "user", content: buildTileUserPrompt(userPrompt, hasLogo) },
  ];

  try {
    const response = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages,
        generation: LM_STUDIO_GENERATION,
      }),
    });

    if (!response.ok) {
      throw new Error(await readApiError(response));
    }

    const data = await response.json();
    const content = data?.content;

    if (typeof content !== "string" || !content.trim()) {
      throw new Error("Leeg antwoord ontvangen van AI.");
    }

    try {
      const payload = parseTileFromAiResponse(content);
      return finalizeTilePayload(payload, options);
    } catch (parseError) {
      if (!hasLogo) throw parseError;
      const fallback = createLogoTileFallback({
        prompt: userPrompt,
        fileName: logoFileName,
      });
      return finalizeTilePayload(fallback, options);
    }
  } catch (error) {
    if (!hasLogo) throw error;

    const fallback = createLogoTileFallback({
      prompt: userPrompt,
      fileName: logoFileName,
    });
    return finalizeTilePayload(fallback, options);
  }
}

/**
 * @param {Response} response
 */
async function readApiError(response) {
  const errorBody = await response.json().catch(() => ({}));
  if (typeof errorBody.error === "string") return errorBody.error;
  return `AI-request mislukt (${response.status})`;
}
