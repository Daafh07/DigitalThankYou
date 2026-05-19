'use client';

import { useEffect, useRef } from 'react';

const delay       = 2000;
const duration    = 1200;
const pause       = 1000;
const heightWaves = 40;
const amountWaves = 4;

export default function loadingAnimation({ onComplete }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const brush = canvas.getContext('2d');
    const pixelRatio = window.devicePixelRatio || 1;

    let canvasWidth = canvas.offsetWidth;
    if (canvasWidth === 0) canvasWidth = 900;
    let canvasHeight = canvas.offsetHeight;
    if (canvasHeight === 0) canvasHeight = 506;

    canvas.width  = canvasWidth * pixelRatio;
    canvas.height = canvasHeight * pixelRatio;
    brush.scale(pixelRatio, pixelRatio);

    let animation;

    async function run() {
      const [logo1, logo2] = await Promise.all([
        loadBitmap('/assets/figma/loadingAnimationLogo1.png'),
        loadBitmap('/assets/figma/loadingAnimationLogo2.png'),
      ]);

      brush.drawImage(logo1, 0, 0, canvasWidth, canvasHeight);

      setTimeout(() => {
        const ease  = animationProgress => animationProgress < .5 ? 2*animationProgress*animationProgress : 1 - (-2*animationProgress+2)**2/2;
        const start = performance.now();

        (function frame(currentTime) {
          const progress = ease(Math.min((currentTime - start) / duration, 1));

          brush.drawImage(logo2, 0, 0, canvasWidth, canvasHeight);
          brush.save();
          brush.beginPath();

          const waveX = canvasWidth - progress * (canvasWidth + heightWaves);

          brush.moveTo(0, 0);
          brush.lineTo(waveX, 0);

          for (let currentAmountWaves = 0; currentAmountWaves <= amountWaves; currentAmountWaves++) {
            const waveY        = (currentAmountWaves / amountWaves) * canvasHeight;
            const waveMidPoint = waveY - (canvasHeight / amountWaves) / 2;
            const waveDirection = currentAmountWaves % 2 === 0 ? heightWaves : -heightWaves;
            brush.quadraticCurveTo(waveX + waveDirection, waveMidPoint, waveX, waveY);
          }

          brush.lineTo(0, canvasHeight);
          brush.closePath();
          brush.clip();
          brush.drawImage(logo1, 0, 0, canvasWidth, canvasHeight);
          brush.restore();

          if (progress < 1) {
            animation = requestAnimationFrame(frame);
          } else {
            setTimeout(() => onComplete?.(), pause);
          }
        })(performance.now());
      }, delay);
    }

    run();
    return () => cancelAnimationFrame(animation);
  }, [onComplete]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block', background: '#f4f9ff' }}
    />
  );
}

function loadBitmap(src) {
  const img = Object.assign(new Image(), { src });
  return img.decode().then(() => createImageBitmap(img));
}