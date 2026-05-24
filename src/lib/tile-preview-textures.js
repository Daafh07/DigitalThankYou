import * as THREE from 'three';

export const TILE_PREVIEW_BACK_LINE_1 = 'Thank you for working with us';
export const TILE_PREVIEW_BACK_LINE_2 = "Let's take a look back";

const CERAMIC_FILL = '#fff8ee';
const TEXT_BLUE = '#1759bb';

/**
 * @param {THREE.Texture} texture
 * @param {THREE.WebGLRenderer} renderer
 */
export function configureTilePreviewTexture(texture, renderer) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} maxWidth
 * @returns {string[]}
 */
function wrapCanvasText(ctx, text, maxWidth) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];

  const lines = [];
  let line = words[0];

  for (let i = 1; i < words.length; i += 1) {
    const next = `${line} ${words[i]}`;
    if (ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = words[i];
    } else {
      line = next;
    }
  }
  lines.push(line);
  return lines;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {string[]} lines
 * @param {number} size
 * @param {number} fontSize
 * @param {number} lineHeight
 */
function drawCenteredLines(ctx, lines, size, fontSize, lineHeight) {
  const blockHeight = lines.length * lineHeight;
  let y = size / 2 - blockHeight / 2 + lineHeight / 2;

  for (const ln of lines) {
    ctx.fillText(ln, size / 2, y);
    y += lineHeight;
  }
}

/**
 * @param {string} text
 * @param {THREE.WebGLRenderer} renderer
 * @returns {THREE.CanvasTexture}
 */
export function createTileFrontTexture(text, renderer) {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context niet beschikbaar.');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = CERAMIC_FILL;
  ctx.fillRect(0, 0, size, size);

  const display = text.trim() || 'Jouw tegel';
  const padding = size * 0.1;
  const maxWidth = size - padding * 2;
  const fontSize = Math.min(
    80,
    Math.max(32, Math.floor(720 / Math.sqrt(display.length))),
  );
  const lineHeight = fontSize * 1.32;

  ctx.fillStyle = TEXT_BLUE;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${fontSize}px "Playfair Display", Georgia, serif`;

  const lines = wrapCanvasText(ctx, display, maxWidth);
  drawCenteredLines(ctx, lines, size, fontSize, lineHeight);

  const texture = new THREE.CanvasTexture(canvas);
  return configureTilePreviewTexture(texture, renderer);
}

/**
 * @param {THREE.WebGLRenderer} renderer
 * @returns {THREE.CanvasTexture}
 */
export function createTileBackTexture(renderer) {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context niet beschikbaar.');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = CERAMIC_FILL;
  ctx.fillRect(0, 0, size, size);

  const padding = size * 0.1;
  const maxWidth = size - padding * 2;

  ctx.fillStyle = TEXT_BLUE;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const titleSize = 52;
  const subtitleSize = 44;
  ctx.font = `600 ${titleSize}px "Playfair Display", Georgia, serif`;
  const line1 = wrapCanvasText(ctx, TILE_PREVIEW_BACK_LINE_1, maxWidth);

  ctx.font = `500 ${subtitleSize}px "Playfair Display", Georgia, serif`;
  const line2 = wrapCanvasText(ctx, TILE_PREVIEW_BACK_LINE_2, maxWidth);

  const titleLineHeight = titleSize * 1.28;
  const subtitleLineHeight = subtitleSize * 1.28;
  const blockHeight =
    line1.length * titleLineHeight +
    size * 0.06 +
    line2.length * subtitleLineHeight;

  let y = size / 2 - blockHeight / 2 + titleLineHeight / 2;

  ctx.font = `600 ${titleSize}px "Playfair Display", Georgia, serif`;
  for (const ln of line1) {
    ctx.fillText(ln, size / 2, y);
    y += titleLineHeight;
  }

  y += size * 0.06 - titleLineHeight / 2 + subtitleLineHeight / 2;
  ctx.font = `500 ${subtitleSize}px "Playfair Display", Georgia, serif`;
  for (const ln of line2) {
    ctx.fillText(ln, size / 2, y);
    y += subtitleLineHeight;
  }

  const texture = new THREE.CanvasTexture(canvas);
  return configureTilePreviewTexture(texture, renderer);
}
