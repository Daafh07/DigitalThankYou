'use client';

import { useEffect, useRef } from 'react';

// ─── Constants ────────────────────────────────────────────────────────────────

// Hoe lang er gewacht wordt (in ms) voordat de veeganimate start na het mounten.
const DELAY      = 2000;

// Hoe lang de veeganimate zelf duurt (in ms).
const DURATION   = 1200;

// Hoe lang er na de veeganimate gepauseerd wordt voordat onComplete aangeroepen wordt.
const PAUSE      = 1000;

// Hoogte van de golvende rand langs de veeg (in pixels).
const WAVE_HEIGHT = 40;

// Aantal golfkammen langs de veegrand.
const WAVE_COUNT  = 4;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Laadt een afbeelding en zet die om naar een hardwaregedecod eerde ImageBitmap.
 * Een ImageBitmap kan direct en snel op een canvas getekend worden, zonder
 * extra decodering op het moment van tekenen.
 */
function loadBitmap(src) {
  const img = Object.assign(new Image(), { src });
  return img.decode().then(() => createImageBitmap(img));
}

/**
 * Kwadratische ease-in-out functie over [0, 1].
 * Zorgt voor een vloeiende versnelling aan het begin en afremming aan het einde
 * van de veeganimate, zodat die niet abrupt begint of stopt.
 */
function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Fullscreen canvas-animatie die van logo1 (donker) naar logo2 (licht) veegt
 * met een golvende verticale rand. Roept onComplete aan als de animatie klaar is.
 *
 * De animatie verloopt in drie fasen:
 *   1. Wacht DELAY ms terwijl logo1 zichtbaar is.
 *   2. Veeg over DURATION ms van rechts naar links met een golvende cliprand.
 *   3. Pauzeer PAUSE ms op het eindframe en roep dan onComplete aan.
 */
export default function LoadingAnimation({ onComplete }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    // Schaal de canvas op naar de werkelijke pixeldichtheid van het scherm,
    // zodat de tekst en afbeeldingen scherp blijven op hoge-DPI-schermen.
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.offsetWidth  || 900;
    const h = canvas.offsetHeight || 506;
    canvas.width  = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    let raf;

    async function run() {
      // Laad beide logoafbeeldingen parallel voor zodat de animatie direct kan starten.
      const [logo1, logo2] = await Promise.all([
        loadBitmap('/assets/figma/loadingAnimationLogo1.png'),
        loadBitmap('/assets/figma/loadingAnimationLogo2.png'),
      ]);

      // Teken het startframe (donker logo) terwijl de DELAY-wachttijd loopt.
      ctx.drawImage(logo1, 0, 0, w, h);

      setTimeout(() => {
        // Start de veegtimer zodra de wachttijd voorbij is.
        const start = performance.now();

        (function frame(now) {
          // Bereken hoever de animatie gevorderd is (0 = begin, 1 = einde),
          // begrensd zodat de waarde nooit boven 1 uitkomt.
          const progress = easeInOut(Math.min((now - start) / DURATION, 1));

          // Teken logo2 (licht) als achtergrond over het volledige canvas.
          ctx.drawImage(logo2, 0, 0, w, h);

          // Clip een gebied links van de veegrand en teken logo1 daaroverheen,
          // zodat logo1 zichtbaar blijft rechts van de huidige veegpositie.
          ctx.save();
          ctx.beginPath();

          // De veegrand beweegt van rechts naar links naarmate progress oploopt.
          const edgeX = w - progress * (w + WAVE_HEIGHT);
          ctx.moveTo(0, 0);
          ctx.lineTo(edgeX, 0);

          // Maak de rand golvend met quadratische bézier-curves langs de Y-as.
          for (let i = 0; i <= WAVE_COUNT; i++) {
            const segY    = (i / WAVE_COUNT) * h;
            const midY    = segY - (h / WAVE_COUNT) / 2;
            // Wissel de golfrichting af: eerst naar rechts, dan naar links, enzovoort.
            const waveDir = i % 2 === 0 ? WAVE_HEIGHT : -WAVE_HEIGHT;
            ctx.quadraticCurveTo(edgeX + waveDir, midY, edgeX, segY);
          }

          ctx.lineTo(0, h);
          ctx.closePath();
          ctx.clip();
          // Teken logo1 alleen binnen het geclipt gebied.
          ctx.drawImage(logo1, 0, 0, w, h);
          ctx.restore();

          if (progress < 1) {
            // Animatie nog niet klaar: vraag een nieuw frame aan.
            raf = requestAnimationFrame(frame);
          } else {
            // Veeg compleet: wacht even en roep dan de callback aan.
            setTimeout(() => onComplete?.(), PAUSE);
          }
        })(performance.now());
      }, DELAY);
    }

    run();

    // Ruim de lopende animatieframe op als de component unmount.
    return () => cancelAnimationFrame(raf);
  }, [onComplete]);

  return (
    // De canvas vult de volledige container en heeft een lichtblauwe achtergrondkleur
    // die zichtbaar is terwijl de afbeeldingen nog laden.
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block', background: '#f4f9ff' }}
    />
  );
}
