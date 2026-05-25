import * as THREE from 'three';
import {
  EMPTY_TILE_TEXTURE,
  TILE_LOGO_BOUNDS,
  loadImageFromDataUrl,
} from '@/lib/tile-logo';
import { configureTilePreviewTexture } from '@/lib/tile-preview-textures';

const TEXTURE_SIZE = 1024;

/** @type {Promise<HTMLImageElement> | null} */
let emptyTileCache = null;

/**
 * Preload emptytile.svg (groot bestand — eenmalig cachen).
 */
export function preloadEmptyTileTexture() {
  if (typeof window === 'undefined') return;
  if (!emptyTileCache) {
    emptyTileCache = loadImageFromUrl(EMPTY_TILE_TEXTURE);
  }
}

function getEmptyTileImage() {
  if (!emptyTileCache) {
    emptyTileCache = loadImageFromUrl(EMPTY_TILE_TEXTURE);
  }
  return emptyTileCache;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {CanvasImageSource} logo
 * @param {number} size
 */
function drawLogoInBounds(ctx, logo, size) {
  const bounds = TILE_LOGO_BOUNDS;
  const areaX = bounds.x * size;
  const areaY = bounds.y * size;
  const areaW = bounds.width * size;
  const areaH = bounds.height * size;

  const logoW =
    'naturalWidth' in logo && logo.naturalWidth ? logo.naturalWidth : logo.width;
  const logoH =
    'naturalHeight' in logo && logo.naturalHeight
      ? logo.naturalHeight
      : logo.height;

  const fitScale = Math.min(areaW / logoW, areaH / logoH);
  const drawW = logoW * fitScale;
  const drawH = logoH * fitScale;
  const drawX = areaX + (areaW - drawW) / 2;
  const drawY = areaY + (areaH - drawH) / 2;

  ctx.drawImage(logo, drawX, drawY, drawW, drawH);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLImageElement} baseTile
 * @param {HTMLImageElement} blueLogo
 * @param {number} size
 */
function paintTileFront(ctx, baseTile, blueLogo, size) {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(baseTile, 0, 0, size, size);
  drawLogoInBounds(ctx, blueLogo, size);
}

/**
 * Laadt een afbeelding vanaf een URL (SVG of raster).
 * @param {string} url
 * @returns {Promise<HTMLImageElement>}
 */
function loadImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(
        new Error(
          'Keramische tegelbasis kon niet laden. Vernieuw de pagina en probeer opnieuw.',
        ),
      );
    image.src = url;
  });
}

/**
 * @param {string} blueLogoDataUrl
 * @returns {Promise<string>} JPEG data URL van het volledige tegelvoorvlak
 */
export async function composeTileFrontDataUrl(blueLogoDataUrl) {
  const [baseTile, blueLogo] = await Promise.all([
    getEmptyTileImage(),
    loadImageFromDataUrl(blueLogoDataUrl),
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context niet beschikbaar.');
  }

  paintTileFront(ctx, baseTile, blueLogo, TEXTURE_SIZE);
  return canvas.toDataURL('image/jpeg', 0.9);
}

/**
 * Composiet voorvlak: emptytile.svg + blauw logo.
 * @param {string} blueLogoDataUrl
 * @param {THREE.WebGLRenderer} renderer
 * @returns {Promise<THREE.CanvasTexture>}
 */
export async function createTileFrontTextureWithLogo(
  blueLogoDataUrl,
  renderer,
) {
  const dataUrl = await composeTileFrontDataUrl(blueLogoDataUrl);
  return createTileFrontTextureFromDataUrl(dataUrl, renderer);
}

/**
 * @param {string} tileFrontDataUrl — reeds samengesteld voorvlak
 * @param {THREE.WebGLRenderer} renderer
 * @returns {Promise<THREE.CanvasTexture>}
 */
export async function createTileFrontTextureFromDataUrl(
  tileFrontDataUrl,
  renderer,
) {
  const image = await loadImageFromDataUrl(tileFrontDataUrl);

  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context niet beschikbaar.');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

  const texture = new THREE.CanvasTexture(canvas);
  return configureTilePreviewTexture(texture, renderer);
}
