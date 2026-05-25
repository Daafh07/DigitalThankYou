/**
 * Logo-upload en conversie naar Delft-blauw (#1759bb) voor keramische tegels.
 */

export const TILE_BLUE = '#1759bb';
export const TILE_BLUE_RGB = { r: 23, g: 89, b: 187 };

/** Logo-zone op de tegel (zelfde verhouding als currentbrand.svg). */
export const TILE_LOGO_BOUNDS = {
  x: 12 / 79,
  y: 23 / 82,
  width: 55 / 79,
  height: 37 / 82,
};

export const EMPTY_TILE_TEXTURE = '/assets/textures/emptytile.svg';

const MAX_LOGO_EDGE = 1200;
const IMAGE_EXT = /\.(png|jpe?g|webp|svg)$/i;

/**
 * @param {File} file
 */
export function isSupportedLogoFile(file) {
  return file.type.startsWith('image/') || IMAGE_EXT.test(file.name);
}

/**
 * @param {File} file
 * @returns {Promise<HTMLImageElement>}
 */
export function readImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!isSupportedLogoFile(file)) {
      reject(new Error('Alleen afbeeldingsbestanden zijn toegestaan (PNG, JPG, WebP, SVG).'));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Logo kon niet worden geladen.'));
      image.src = typeof reader.result === 'string' ? reader.result : '';
    };
    reader.onerror = () => reject(new Error('Bestand kon niet worden gelezen.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Afgeleid van bestandsnaam: "Acme Corp.png" → "Acme Corp"
 * @param {string} [fileName]
 */
export function titleFromLogoFileName(fileName) {
  if (!fileName) return 'Partner tegel';
  const base = fileName.replace(/\.[^.]+$/, '').trim();
  return base || 'Partner tegel';
}

/**
 * Zet een logo om naar monochrome Delft-blauw (transparante achtergrond).
 * Donkere én gekleurde pixels blijven zichtbaar; witte achtergrond wordt transparant.
 * @param {CanvasImageSource} source
 * @returns {string} data URL (PNG)
 */
export function convertLogoToBlueStyle(source) {
  const srcWidth =
    'naturalWidth' in source && source.naturalWidth
      ? source.naturalWidth
      : source.width;
  const srcHeight =
    'naturalHeight' in source && source.naturalHeight
      ? source.naturalHeight
      : source.height;

  const scale = Math.min(1, MAX_LOGO_EDGE / Math.max(srcWidth, srcHeight));
  const width = Math.max(1, Math.round(srcWidth * scale));
  const height = Math.max(1, Math.round(srcHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context niet beschikbaar.');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;
  const { r: br, g: bg, b: bb } = TILE_BLUE_RGB;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const alpha = data[i + 3];
    if (alpha < 12) continue;

    const whiteness = Math.min(r, g, b) / 255;
    const ink = (1 - whiteness) * (alpha / 255);
    const outAlpha = Math.round(ink * 255);

    if (outAlpha < 10) {
      data[i + 3] = 0;
      continue;
    }

    data[i] = br;
    data[i + 1] = bg;
    data[i + 2] = bb;
    data[i + 3] = outAlpha;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * @param {string} dataUrl
 * @returns {Promise<HTMLImageElement>}
 */
export function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Afbeelding kon niet worden geladen.'));
    image.src = dataUrl;
  });
}
