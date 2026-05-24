/**
 * Tile schema — definieert de structuur van AI-gegenereerde tegels
 * en biedt validatie + normalisatie van ruwe LLM-output.
 */

/** @typedef {'dark' | 'light'} TileTheme */
/** @typedef {'blue' | 'green' | 'purple' | 'amber' | 'rose'} TileAccent */
/** @typedef {'small' | 'medium' | 'large'} TileSize */

/**
 * @typedef {Object} TileStyle
 * @property {TileTheme} [theme]
 * @property {TileAccent} [accent]
 * @property {TileSize} [size]
 */

/**
 * @typedef {Object} GeneratedTileData
 * @property {string} id
 * @property {string} title
 * @property {string} [subtitle]
 * @property {string} [description]
 * @property {string} [image]
 * @property {string} [buttonText]
 * @property {TileStyle} [style]
 * @property {number} createdAt
 */

const VALID_THEMES = new Set(["dark", "light"]);
const VALID_ACCENTS = new Set(["blue", "green", "purple", "amber", "rose"]);
const VALID_SIZES = new Set(["small", "medium", "large"]);

/** System prompt die de LLM dwingt uitsluitend geldige JSON te retourneren. */
export const TILE_SYSTEM_PROMPT = `Je bent een UI-generator voor een digitale workspace.
Je antwoordt ALLEEN met een enkel JSON-object — geen markdown, geen uitleg, geen codeblokken.

Het JSON-object moet exact deze structuur volgen:
{
  "title": "string (verplicht, korte titel)",
  "subtitle": "string (optioneel)",
  "description": "string (optioneel, korte beschrijving)",
  "image": "string (optioneel, pad zoals /assets/figma/livewall-room.png)",
  "buttonText": "string (optioneel, tekst voor actieknop)",
  "style": {
    "theme": "dark | light",
    "accent": "blue | green | purple | amber | rose",
    "size": "small | medium | large"
  }
}

Regels:
- Geef NOOIT tekst buiten het JSON-object.
- title is altijd verplicht en beschrijvend.
- Kies style.theme, style.accent en style.size passend bij de gebruikersprompt.
- Gebruik bestaande asset-paden indien een afbeelding nodig is: /assets/figma/livewall-room.png, /assets/figma/newLogo.svg, /assets/figma/interstitial-building.png
- Schrijf in het Nederlands tenzij de gebruiker een andere taal vraagt.`;

/**
 * Extraheert JSON uit ruwe LLM-output (ondersteunt markdown code fences).
 * @param {string} raw
 * @returns {unknown}
 */
export function extractJsonFromResponse(raw) {
  const trimmed = raw.trim();

  // Direct parsen als het al puur JSON is
  try {
    return JSON.parse(trimmed);
  } catch {}

  // JSON uit ```json ... ``` of ``` ... ``` blokken halen
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    return JSON.parse(fenceMatch[1].trim());
  }

  // Eerste { ... } blok zoeken
  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    return JSON.parse(objectMatch[0]);
  }

  throw new Error("Geen geldig JSON-object gevonden in AI-antwoord.");
}

/**
 * Normaliseert en valideert ruwe tile-data tot een consistent object.
 * @param {unknown} raw
 * @returns {Omit<GeneratedTileData, 'id' | 'createdAt'>}
 */
export function normalizeTilePayload(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Tile-data moet een object zijn.");
  }

  const data = /** @type {Record<string, unknown>} */ (raw);

  const title = typeof data.title === "string" ? data.title.trim() : "";
  if (!title) {
    throw new Error('Tile mist een verplichte "title".');
  }

  const styleRaw =
    data.style && typeof data.style === "object"
      ? /** @type {Record<string, unknown>} */ (data.style)
      : {};

  const theme =
    typeof styleRaw.theme === "string" && VALID_THEMES.has(styleRaw.theme)
      ? styleRaw.theme
      : "dark";

  const accent =
    typeof styleRaw.accent === "string" && VALID_ACCENTS.has(styleRaw.accent)
      ? styleRaw.accent
      : "blue";

  const size =
    typeof styleRaw.size === "string" && VALID_SIZES.has(styleRaw.size)
      ? styleRaw.size
      : "medium";

  return {
    title,
    subtitle:
      typeof data.subtitle === "string" ? data.subtitle.trim() : undefined,
    description:
      typeof data.description === "string"
        ? data.description.trim()
        : undefined,
    image: typeof data.image === "string" ? data.image.trim() : undefined,
    buttonText:
      typeof data.buttonText === "string" ? data.buttonText.trim() : undefined,
    style: { theme, accent, size },
  };
}

/**
 * @param {unknown} raw
 * @returns {Omit<GeneratedTileData, 'id' | 'createdAt'>}
 */
export function parseTileFromAiResponse(raw) {
  const extracted =
    typeof raw === "string" ? extractJsonFromResponse(raw) : raw;
  return normalizeTilePayload(extracted);
}
