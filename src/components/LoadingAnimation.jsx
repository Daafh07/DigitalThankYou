'use client';

import { useEffect, useRef } from 'react';

const W = 900;
const H = 506;
const DELAY    = 1500; 
const DURATION = 1800;
const EDGE     = 0.06; 
const BIAS     = 0.72;

function makeNoise() {
  const n = new Float32Array(W * H);

  for (const [scale, amp] of [[W/2.5, .5],[W/6, .28],[W/14, .14],[W/30, .08]]) {
    const cols = Math.ceil(W/scale) + 2;
    const g = Float32Array.from({ length: cols * (Math.ceil(H/scale)+2) }, Math.random);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const x0 = Math.floor(x/scale), y0 = Math.floor(y/scale);
      const fx = x/scale - x0,        fy = y/scale - y0;
      const sx = fx*fx*(3-2*fx),       sy = fy*fy*(3-2*fy);
      n[y*W+x] += (g[y0*cols+x0]*(1-sx)*(1-sy) + g[y0*cols+x0+1]*sx*(1-sy)
                 + g[(y0+1)*cols+x0]*(1-sx)*sy  + g[(y0+1)*cols+x0+1]*sx*sy) * amp;
    }
  }


  for (let i = 0; i < n.length; i++)
    n[i] = n[i] * (1-BIAS) + (1 - (i%W) / (W-1)) * BIAS;


  let mn = Infinity, mx = -Infinity;
  for (const v of n) { if (v < mn) mn = v; if (v > mx) mx = v; }
  return n.map(v => (v-mn) / (mx-mn));
}

function loadBitmap(src) {
  const img = Object.assign(new Image(), { src });
  return img.decode().then(() => createImageBitmap(img));
}

function getPixels(bitmap) {
  const off = new OffscreenCanvas(W, H);
  const c = off.getContext('2d');
  c.drawImage(bitmap, 0, 0, W, H);
  return c.getImageData(0, 0, W, H).data;
}


export default function loadingAnimation({ onComplete }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    canvas.width  = W;
    canvas.height = H;

    let rafId;

    async function run() {
      const [green, blue] = await Promise.all([
        loadBitmap('/assets/figma/loadingAnimationLogo1.png'),
        loadBitmap('/assets/figma/loadingAnimationLogo2.png'),
      ]);


      ctx.drawImage(green, 0, 0, W, H);

      setTimeout(() => {
        const from  = getPixels(green);
        const to    = getPixels(blue);
        const noise = makeNoise();
        const ease  = t => t < .5 ? 2*t*t : 1 - (-2*t+2)**2/2;
        const start = performance.now();

        (function frame(now) {
          const p = ease(Math.min((now-start)/DURATION, 1));
          const out = ctx.createImageData(W, H);

          for (let i = 0; i < W*H; i++) {
            const r   = Math.max(0, Math.min(1, (p - noise[i] + EDGE) / (2*EDGE)));
            const ink = r > 0 && r < 1 ? (1 - Math.abs(r-.5)*2) * .55 : 0;
            const px  = i*4;
            out.data[px]   = (from[px]  *(1-r) + to[px]  *r) * (1-ink);
            out.data[px+1] = (from[px+1]*(1-r) + to[px+1]*r) * (1-ink);
            out.data[px+2] = (from[px+2]*(1-r) + to[px+2]*r) * (1-ink) + ink*8;
            out.data[px+3] = 255;
          }

          ctx.putImageData(out, 0, 0);

          if (p < 1) {
            rafId = requestAnimationFrame(frame);
         } else {
  ctx.drawImage(blue, 0, 0, W, H);
  setTimeout(() => onComplete?.(), 1000);
}
        })(performance.now());
      }, DELAY);
    }

    run();

    return () => cancelAnimationFrame(rafId);
  }, [onComplete]);

 return (
  <canvas
    ref={canvasRef}
    style={{ width: '100%', height: '100%', display: 'block', background: '#f4f9ff' }}
  />
);
}