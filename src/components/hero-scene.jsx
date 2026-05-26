"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import TileDownloadButton from "./ui/tile-download-button";

// ─── Muurgrid ────────────────────────────────────────────────────────────────

// Afmetingen van het tegelraster op de muur.
const TILE_COLS = 10;
const TILE_ROWS = 6;
const TILE_COUNT = TILE_COLS * TILE_ROWS; // totaal 60 tegels

// Welk rasterindices de centrale tegel van het huidige merk is.
const CURRENT_BRAND_INDEX = 24;

// ─── Textuurpaden ─────────────────────────────────────────────────────────────

// SVG-bestanden die als kanaaltexturen worden ingeladen.
const EMPTY_TILE_TEXTURE = "/assets/textures/emptytile.svg";
const CURRENT_BRAND_TEXTURE = "/assets/textures/currentbrand.svg";
const RITUALS_TEXTURE = "/assets/textures/rituals.svg";
const BURGERKING_TEXTURE = "/assets/textures/burgerking.svg";
const LOCKED_TILE_TEXTURE = "/assets/textures/lockedtile.svg";
const TILE_BACK_TEXTURE = "/assets/textures/achterkantefteling.svg";
const CERAMIC_EDGE_TEXTURE = "/assets/textures/keramiek.jpg"; // JPG voor de keramische rand

// ─── Audio ────────────────────────────────────────────────────────────────────

// Geluidsbestand dat afspeelt als een tegel de muur raakt.
const DROP_SOUND = "/assets/audio/dropsound.mp3";

// ─── Scènegeometrie ───────────────────────────────────────────────────────────

// Uniforme schaalfactor van de zwevende tegel wanneer de gebruiker hem vasthoudt.
const FREE_TILE_SCALE = 3.75;

// Z-diepte van de zwevende tegel voor de camera (hoe groter, hoe dichterbij).
const FREE_TILE_Z = 3.25;

// Dikte van de keramische doosvorm van de tegel (in world-units).
const TILE_DEPTH = 0.1;

// Breedte/hoogte-verhouding van de tegelafbeelding.
const TILE_ART_ASPECT = 79 / 82;

// Beginopaciteit van de donkere vignet-overlay die de aandacht naar het midden trekt.
const FOCUS_OVERLAY_OPACITY = 0.22;

// Overlay na het ontgrendelen van het tegeltje (#002045, 50%).
const UNLOCK_OVERLAY_OPACITY = 0.5;

// Genormaliseerde positie en afmetingen van het tegelraster binnen de achtergrondafbeelding.
// Waarden zijn fracties van de canvasbreedte/-hoogte (0 = links/boven, 1 = rechts/onder).
const WALL_VIEWPORT = {
  left: 0.2208,
  top: 0.1444,
  width: 0.5604,
  height: 0.5356 * 0.964,
};

const WALL_ENTRANCE_GROUP_DELAY = 0.36;
const WALL_ENTRANCE_DURATION_MIN = 2.35;
const WALL_ENTRANCE_DURATION_VARIANCE = 0.75;
const WALL_ENTRANCE_COMPLETE_AFTER = 8.5;

// ─── Easing helpers ───────────────────────────────────────────────────────────

/**
 * Kubische ease-in-out over [0, 1].
 * Gebruikt voor de invoeg- en extraheeranimatie van de tegel.
 */
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/**
 * Ken Perlin's smootherstep over [0, 1].
 * De eerste én tweede afgeleide zijn nul aan de uiteinden, wat zorgt voor
 * een extra vloeiende overgang zonder zichtbare schokkende aanzet of stop.
 */
function smootherStep(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

// ─── Textuurhelpers ───────────────────────────────────────────────────────────

/**
 * Past optimale filterinstellingen toe op een Three.js-textuur.
 * Anisotropisch filteren vermindert wazig worden bij scherpe kijkhoeken.
 * Mipmaps zorgen voor antialiasing op afstand.
 */
function configureTexture(texture, renderer) {
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
 * Laadt een SVG-bestand in een `size × size`-canvas en geeft een CanvasTexture terug.
 * Een lichtbeige achtergrond wordt eerst geschilderd zodat transparante SVG's er goed
 * uitzien zonder zwarte randen.
 * Roept `onComplete` aan zodra de afbeelding gedecod eerd is (of meteen bij een fout).
 */
function loadSvgTexture(url, renderer, version, size = 2048, onComplete) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Lichtbeige achtergrond die overeenkomt met de keramische tegelkleur.
  ctx.fillStyle = "#fff8ee";
  ctx.fillRect(0, 0, size, size);

  const texture = configureTexture(new THREE.CanvasTexture(canvas), renderer);
  const image = new Image();

  image.onload = () => {
    // Teken de SVG op het canvas zodra de afbeelding geladen is
    // en markeer de textuur als gewijzigd zodat Three.js hem opnieuw uploadt.
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "#fff8ee";
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(image, 0, 0, size, size);
    texture.needsUpdate = true;
    onComplete?.();
  };
  image.onerror = () => onComplete?.(); // bij fout toch doorgaan zodat de ready-teller niet vastloopt
  image.src = `${url}?v=${version}`;

  return texture;
}

/**
 * Laadt een rasterafbeelding (PNG, JPG, …) via de Three.js TextureLoader.
 * Configureert de textuur zodra die geladen is en roept `onComplete` aan.
 */
function loadImageTexture(url, renderer, version, onComplete) {
  const loader = new THREE.TextureLoader();
  const texture = loader.load(
    `${url}?v=${version}`,
    () => {
      configureTexture(texture, renderer);
      onComplete?.();
    },
    undefined,
    () => onComplete?.(), // bij fout toch doorgaan
  );
  return configureTexture(texture, renderer);
}

/**
 * Genereert een dynamische canvas-textuur waarop barsten frame voor frame
 * vanuit het midden kunnen groeien. De paden worden vooraf willekeurig
 * bepaald; update(progress, glowAmount) tekent alleen het zichtbare deel.
 * glowAmount (0-1) voegt gouden lichtgloed toe tussen de barsten (licht dat
 * door de scheuren sijpelt vlak voor de breuk).
 */
function createGrowingCrackTexture(renderer) {
  const size   = 2048;
  const canvas = document.createElement('canvas');
  canvas.width  = size;
  canvas.height = size;
  const ctx    = canvas.getContext('2d');
  ctx.lineCap  = 'round';
  ctx.lineJoin = 'round';

  // Slagschaduw iets offset zodat barsten reliëf krijgen.
  let center = { x: size * 0.5, y: size * 0.5 };
  const paths = [];
  const texture = configureTexture(new THREE.CanvasTexture(canvas), renderer);

  const createPath = (angle, length, width, branchLevel = 0, startPoint = center) => {
    let x = startPoint.x;
    let y = startPoint.y;
    let a = angle;
    const points = [{ x, y }];
    // Meer segmenten = vloeiendere, organischere barsten
    const segments = 72 + Math.floor(Math.random() * 36);

    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      // Stap varieert: kort aan begin (scherpe start), langer naar buiten
      const stepBase = (length / segments) * (0.7 + t * 0.6);
      const step = stepBase * (0.82 + Math.random() * 0.38);
      // Kleine continue afwijking + zeldzame grote knik (geeft echte scheurkarakter)
      a += (Math.random() - 0.5) * 0.13;
      if (Math.random() < 0.06) a += (Math.random() - 0.5) * 0.9;
      // Vroeg in de barst iets meer krom (impact-zone)
      if (t < 0.2) a += (Math.random() - 0.5) * 0.08;

      x += Math.cos(a) * step;
      y += Math.sin(a) * step;
      points.push({ x, y });

      // Vertakkingen: meer van ze, ook dieper (level 3)
      if (branchLevel < 3 && t > 0.18 && t < 0.88 && Math.random() < 0.1) {
        const side = Math.random() > 0.5 ? 1 : -1;
        const branchAngle  = a + side * (0.45 + Math.random() * 0.85);
        const branchLength = length * (0.1 + Math.random() * 0.28);
        const branchWidth  = width * (0.28 + Math.random() * 0.28);
        paths.push(createPath(branchAngle, branchLength, branchWidth, branchLevel + 1, { x, y }));
      }
    }

    return {
      points,
      width,
      // Hoofdbarsten starten tegelijk; branches kort erna
      delay: branchLevel * 0.08 + Math.random() * 0.06,
      speed: 0.88 + Math.random() * 0.24,
      isMain: branchLevel === 0,
    };
  };

  const regenerate = () => {
    paths.length = 0;
    // Licht geöffset impact-centrum voor meer realisme
    center = {
      x: size * (0.48 + (Math.random() - 0.5) * 0.06),
      y: size * (0.48 + (Math.random() - 0.5) * 0.06),
    };
    // 12 hoofdbarsten i.p.v. 8 → dichtere spinnenweb-look
    const mainCrackCount = 12;
    for (let i = 0; i < mainCrackCount; i++) {
      const baseAngle = (Math.PI * 2 * i) / mainCrackCount;
      // Clusters van 2-3 barsten dicht bij elkaar voor organische look
      const clusterOffset = (Math.random() - 0.5) * 0.28;
      const angle  = baseAngle + clusterOffset;
      const length = size * (0.38 + Math.random() * 0.36);
      // Variabele dikte: 1-2 extra-dikke "primaire" barsten
      const width  = i % 3 === 0 ? 14 + Math.random() * 8 : 6 + Math.random() * 8;
      paths.push(createPath(angle, length, width));
    }
  };

  const drawPartialPath = (path, visibleAmount, glowAmount) => {
    const points  = path.points;
    const maxIndex = Math.floor((points.length - 1) * visibleAmount);
    if (maxIndex < 1) return;

    // Gouden gloed-halo achter de barst (licht dat er doorheen sijpelt)
    if (glowAmount > 0 && path.isMain) {
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i <= maxIndex; i++) ctx.lineTo(points[i].x, points[i].y);
      ctx.strokeStyle = `rgba(255,210,80,${glowAmount * 0.55})`;
      ctx.lineWidth   = path.width * 6.5;
      ctx.shadowColor = 'rgba(255,180,30,0.9)';
      ctx.shadowBlur  = path.width * 4;
      ctx.stroke();
      ctx.shadowBlur  = 0;
    }

    // Brede zachte witte rand (geeft diepte en verlichting)
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i <= maxIndex; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.strokeStyle = 'rgba(255,255,255,0.38)';
    ctx.lineWidth   = path.width * 2.4;
    ctx.stroke();

    // Donkere kern van de scheur
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i <= maxIndex; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.strokeStyle = 'rgba(8,22,55,0.96)';
    ctx.lineWidth   = path.width;
    ctx.stroke();

    // Fijne donkere schaduwlijn (geeft scheur diepte)
    ctx.beginPath();
    ctx.moveTo(points[0].x - 1.5, points[0].y + 1);
    for (let i = 1; i <= maxIndex; i++) ctx.lineTo(points[i].x - 1.5, points[i].y + 1);
    ctx.strokeStyle = 'rgba(0,5,20,0.34)';
    ctx.lineWidth   = Math.max(1, path.width * 0.18);
    ctx.stroke();

    // Fijne witte highlight-lijn langs de bovenkant (maakt barst 3D)
    ctx.beginPath();
    ctx.moveTo(points[0].x + 1.5, points[0].y - 1);
    for (let i = 1; i <= maxIndex; i++) ctx.lineTo(points[i].x + 1.5, points[i].y - 1);
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth   = Math.max(0.8, path.width * 0.14);
    ctx.stroke();

    // Lichtpuntje aan het groeipunt van de barst
    const head = points[maxIndex];
    const headGlow = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, path.width * 1.8);
    headGlow.addColorStop(0,   'rgba(255,255,255,0.95)');
    headGlow.addColorStop(0.4, 'rgba(200,220,255,0.55)');
    headGlow.addColorStop(1,   'rgba(255,255,255,0)');
    ctx.fillStyle = headGlow;
    ctx.beginPath();
    ctx.arc(head.x, head.y, path.width * 1.8, 0, Math.PI * 2);
    ctx.fill();
  };

  const update = (progress, glowAmount = 0) => {
    ctx.clearRect(0, 0, size, size);

    // Clip alles binnen de tegelgrens zodat barsten nooit buiten de tegel lopen.
    // Kleine inset (40px) zodat de rand van het keramiek zichtbaar blijft.
    const inset = 40;
    ctx.save();
    ctx.beginPath();
    ctx.rect(inset, inset, size - inset * 2, size - inset * 2);
    ctx.clip();

    // Impact-kern: groeiende witte gloed op het breekpunt
    const centerRadius = 18 + progress * 180;
    const impactGradient = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, centerRadius);
    impactGradient.addColorStop(0,    'rgba(255,255,255,0.98)');
    impactGradient.addColorStop(0.22, 'rgba(255,240,180,0.82)');
    impactGradient.addColorStop(0.55, 'rgba(255,200,60,0.3)');
    impactGradient.addColorStop(1,    'rgba(255,200,60,0)');
    ctx.fillStyle = impactGradient;
    ctx.beginPath();
    ctx.arc(center.x, center.y, centerRadius, 0, Math.PI * 2);
    ctx.fill();

    // Teken branches eerst (onder de hoofdbarsten)
    paths.forEach((path) => {
      if (path.isMain) return;
      const localProgress = THREE.MathUtils.clamp((progress - path.delay) * path.speed, 0, 1);
      const eased = localProgress < 0.5
        ? 2 * localProgress * localProgress
        : 1 - ((-2 * localProgress + 2) ** 2) / 2;
      drawPartialPath(path, eased, glowAmount * 0.6);
    });

    // Teken hoofdbarsten bovenop
    paths.forEach((path) => {
      if (!path.isMain) return;
      const localProgress = THREE.MathUtils.clamp((progress - path.delay) * path.speed, 0, 1);
      const eased = localProgress < 0.5
        ? 2 * localProgress * localProgress
        : 1 - ((-2 * localProgress + 2) ** 2) / 2;
      drawPartialPath(path, eased, glowAmount);
    });

    // Gouden gloed-puls in het midden vlak voor de breuk
    if (glowAmount > 0) {
      const gCenterR = 60 + glowAmount * 280;
      const gGrad = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, gCenterR);
      gGrad.addColorStop(0,   `rgba(255,220,80,${glowAmount * 0.88})`);
      gGrad.addColorStop(0.3, `rgba(255,160,20,${glowAmount * 0.55})`);
      gGrad.addColorStop(1,   'rgba(255,140,0,0)');
      ctx.fillStyle = gGrad;
      ctx.beginPath();
      ctx.arc(center.x, center.y, gCenterR, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore(); // clip opheffen

    texture.needsUpdate = true;
  };

  regenerate();
  update(0);

  return { texture, regenerate, update };
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * De volledige WebGL-muurscène, gerenderd in een gewone <div>.
 * Beheert de complete Three.js-lifecycle: opbouw, animatielus en afbraak.
 *
 * Props:
 *   onReady                    – aangeroepen zodra het eerste frame én ≥4 texturen geladen zijn
 *   onFocusOverlayChange(bool) – meldt wanneer de donkere vignet-overlay zichtbaar moet zijn
 *   onRevealLightChange(bool)  – meldt wanneer de gouden onthullingsgloed zichtbaar moet zijn
 *   externalFocusOverlayVisible – de bovenliggende component kan de overlay forceren (bijv. tijdens ingang)
 *   startIntro                 – zet op true om de ontgrendelsequentie te starten
 *   startWallEntrance          – zet op true om de tegels vanuit de rand te laten invliegen
 *   onStartIntroRequest        – aangeroepen als de gebruiker op de tegel klikt om de intro te starten
 *   onWallEntranceComplete     – aangeroepen als het tegelraster klaar op de muur staat
 */
export default function HeroScene({
  onReady,
  onFocusOverlayChange,
  onRevealLightChange,
  externalFocusOverlayVisible,
  startIntro = true,
  startWallEntrance = false,
  lockedGlowEnabled = true,
  unlockDimEnabled  = false,
  onStartIntroRequest,
  onWallEntranceComplete,
  onTileImpact,
  onIntroComplete,
  onTileInserted,
} = {}) {
  const hostRef = useRef(null);
  const cameraRef = useRef(null);
  const floatingTileRef = useRef(null);
  const [showTileDownload, setShowTileDownload] = useState(false);
  const [showUnlockOverlay, setShowUnlockOverlay] = useState(false);

  // Refs slaan de actuele prop-waarden op zodat de imperatieve animatielus
  // altijd de meest recente waarden ziet zonder dat het effect opnieuw hoeft te draaien.
  const startIntroRef = useRef(startIntro);
  const startWallEntranceRef = useRef(startWallEntrance);
  const lockedGlowEnabledRef = useRef(lockedGlowEnabled);
  const externalOverlayRef  = useRef(externalFocusOverlayVisible ?? true);

  useEffect(() => { externalOverlayRef.current  = externalFocusOverlayVisible ?? true; }, [externalFocusOverlayVisible]);
  useEffect(() => { startIntroRef.current        = startIntro;        }, [startIntro]);
  useEffect(() => { startWallEntranceRef.current = startWallEntrance; }, [startWallEntrance]);
  useEffect(() => { lockedGlowEnabledRef.current  = lockedGlowEnabled; }, [lockedGlowEnabled]);
  const unlockDimRef = useRef(unlockDimEnabled);
  useEffect(() => { unlockDimRef.current = unlockDimEnabled; }, [unlockDimEnabled]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    // ── Renderer & camera ────────────────────────────────────────────────────

    const scene = new THREE.Scene();

    // Transparante WebGL-renderer zodat de achtergrondafbeelding van de kamer zichtbaar blijft.
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setClearColor("#000000", 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    host.appendChild(renderer.domElement);
    renderer.domElement.style.position = "absolute";
    renderer.domElement.style.inset = "0";
    renderer.domElement.style.zIndex = "1";

    // Orthografische camera: world-units komen direct overeen met de genormaliseerde viewport-rect.
    // Hierdoor is het positioneren van tegels een kwestie van simpele vermenigvuldiging.
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // ── Ready gate ───────────────────────────────────────────────────────────

    // onReady mag pas afgaan als het eerste frame getekend is én minstens 4 texturen
    // volledig geladen zijn. Zo ziet de bovenliggende component nooit een kaal raster.
    let loadedTextures = 0;
    let firstFrameDone = false;
    let readyFired = false;

    const notifyReady = () => {
      if (readyFired || loadedTextures < 4 || !firstFrameDone) return;
      readyFired = true;
      onReady?.();
    };

    // Elke textuurl aadcallback roept dit aan om de teller bij te houden.
    const markTextureLoaded = () => {
      loadedTextures++;
      notifyReady();
    };

    // ── Textures ─────────────────────────────────────────────────────────────

    // Voeg een unieke versie-timestamp toe zodat de browser nooit een verouderde
    // versie uit de cache gebruikt na een deploy.
    const version = Date.now();
    const emptyTexture = loadSvgTexture(
      EMPTY_TILE_TEXTURE,
      renderer,
      version,
      2048,
      markTextureLoaded,
    );
    const currentBrandTexture = loadSvgTexture(
      CURRENT_BRAND_TEXTURE,
      renderer,
      version,
      2048,
      markTextureLoaded,
    );
    const tileBackTexture = loadSvgTexture(
      TILE_BACK_TEXTURE,
      renderer,
      version,
      2048,
      markTextureLoaded,
    );
    const ceramicEdgeTexture = loadImageTexture(
      CERAMIC_EDGE_TEXTURE,
      renderer,
      version,
      markTextureLoaded,
    );

    // Deze texturen tellen niet mee voor de ready-gate (geen markTextureLoaded callback).
    const ritualsTexture = loadSvgTexture(
      RITUALS_TEXTURE,
      renderer,
      version,
      2048,
    );
    const burgerkingTexture = loadSvgTexture(
      BURGERKING_TEXTURE,
      renderer,
      version,
      2048,
    );
    const lockedTexture = loadSvgTexture(
      LOCKED_TILE_TEXTURE,
      renderer,
      version,
      2048,
    );

    // De barst-textuur wordt procedureel gegenereerd en tijdens de reveal per frame bijgewerkt.
    const crackMask          = createGrowingCrackTexture(renderer);
    const crackTexture       = crackMask.texture;

    // ── Materials ─────────────────────────────────────────────────────────────

    // Alle materialen zijn MeshBasicMaterial zodat ze geen lichtbronnen nodig hebben.
    const emptyMaterial = new THREE.MeshBasicMaterial({
      color: "#ffffff",
      map: emptyTexture,
      toneMapped: false,
    });
    const blankMaterial = new THREE.MeshBasicMaterial({
      color: "#fffdf8",
      toneMapped: false,
    });
    const ritualsMaterial = new THREE.MeshBasicMaterial({
      color: "#ffffff",
      map: ritualsTexture,
      toneMapped: false,
    });
    const burgerkingMaterial = new THREE.MeshBasicMaterial({
      color: "#ffffff",
      map: burgerkingTexture,
      toneMapped: false,
    });
    const currentBrandMaterial = new THREE.MeshBasicMaterial({
      color: "#ffffff",
      map: currentBrandTexture,
      toneMapped: false,
      transparent: true,
      opacity: 1,
    });
    const tileBackMaterial = new THREE.MeshBasicMaterial({
      color: "#ffffff",
      map: tileBackTexture,
      toneMapped: false,
      transparent: true,
      opacity: 1,
    });
    const ceramicSideMaterial = new THREE.MeshBasicMaterial({
      color: "#ffffff",
      map: ceramicEdgeTexture,
      toneMapped: false,
    });
    const lockedMaterial = new THREE.MeshBasicMaterial({
      color: "#ffffff",
      map: lockedTexture,
      toneMapped: false,
      transparent: true,
      opacity: 1,
      depthWrite: false,
    });

    // Gouden glans die de onthullingslichtstralen vormt (additief blenden = optellen van kleuren).
    const revealLightMaterial = new THREE.MeshBasicMaterial({ color: '#ffd060', transparent: true, opacity: 0, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide });

    // Barst-overlay die over de tegel getekend wordt tijdens de ontgrendeling.
    const crackOverlayMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', map: crackTexture, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, blending: THREE.NormalBlending });

    // Flash-overlay materiaal (mesh aangemaakt na overlayGeometry hieronder)
    const flashOverlayMaterial = new THREE.MeshBasicMaterial({ color: '#fff8e0', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });

    // ── Shared geometries ─────────────────────────────────────────────────────

    // Gedeelde geometrieën worden hergebruikt voor alle tegels om GPU-geheugen te sparen.
    const tileGeometry = new THREE.PlaneGeometry(1, 1); // platte muurtegelplane
    const floatingTileGeometry = new THREE.BoxGeometry(1, 1, TILE_DEPTH); // 3D-keramische doos
    const overlayGeometry = new THREE.PlaneGeometry(1, 1); // vignet en lichtoverlays

    // Flash-overlay: felle witte flits op het moment van breuk
    const flashOverlay = new THREE.Mesh(overlayGeometry, flashOverlayMaterial);
    flashOverlay.renderOrder = 12;
    flashOverlay.visible     = false;

    // ── Focus overlay ─────────────────────────────────────────────────────────

    // Een donkere halftransparante plane over het hele canvas die de aandacht
    // naar de centrale tegel trekt. Verdwijnt wanneer de tegel ingevoegd is.
    const overlayMaterial = new THREE.MeshBasicMaterial({
      color: "#071326",
      transparent: true,
      opacity: FOCUS_OVERLAY_OPACITY,
      depthWrite: false,
      toneMapped: false,
    });
    const focusOverlay = new THREE.Mesh(overlayGeometry, overlayMaterial);
    focusOverlay.position.z = 0.82;
    focusOverlay.renderOrder = 2;
    scene.add(focusOverlay);

    // Overlay na unlock: zelfde plane, maar #002045; renderOrder onder het zwevende tegeltje (3).
    const unlockOverlayMaterial = new THREE.MeshBasicMaterial({
      color: "#002045",
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
    });
    const unlockOverlay = new THREE.Mesh(
      overlayGeometry,
      unlockOverlayMaterial,
    );
    unlockOverlay.position.z = 0.83;
    unlockOverlay.renderOrder = 2;
    unlockOverlay.visible = false;
    scene.add(unlockOverlay);

    // ── Dust particles ────────────────────────────────────────────────────────

    // Gouden stofdeeltjes die bij impact van de tegel uitzwermen.
    // Ze staan in een ellipsvorm gerangschikt rond het middelpunt.
    const particleCount = 260;
    const particlePositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() ** 1.8 * 2.8; // kwadraat zorgt voor meer deeltjes in het midden
      particlePositions[i * 3] = Math.cos(angle) * radius;
      particlePositions[i * 3 + 1] = Math.sin(angle) * radius * 0.72; // licht afgeplat tot ellips
      particlePositions[i * 3 + 2] = 0.22 + Math.random() * 0.74;
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(particlePositions, 3),
    );
    const particleMaterial = new THREE.PointsMaterial({
      color: "#dfc179",
      size: 0.015,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    particles.renderOrder = 4;
    scene.add(particles);

    // ── Shockwave ring ────────────────────────────────────────────────────────

    // Een uitdijende ring die zichtbaar wordt op het moment van impact.
    const shockwaveMaterial = new THREE.MeshBasicMaterial({
      color: "#d1a14a",
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const shockwave = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.01, 8, 72),
      shockwaveMaterial,
    );
    shockwave.position.z = 0.22;
    shockwave.renderOrder = 4;
    scene.add(shockwave);

    // ── Wall tile grid ────────────────────────────────────────────────────────

    // Alle 60 muurtegelme shes worden in één groep gehangen.
    // De groep is initieel onzichtbaar en wordt zichtbaar zodra de ingangsanimatie start.
    const wallGroup = new THREE.Group();
    wallGroup.visible = false;
    scene.add(wallGroup);

    const tiles = [];
    for (let i = 0; i < TILE_COUNT; i++) {
      // Wijs een speciaal materiaal toe aan de centrale slot en de buren ervan.
      let mat = emptyMaterial;
      if (i === CURRENT_BRAND_INDEX) mat = blankMaterial; // centrale slot: leeg (wordt gevuld door de gebruiker)
      if (i === CURRENT_BRAND_INDEX - 1) mat = ritualsMaterial; // linker buurmerk
      if (i === CURRENT_BRAND_INDEX + 1) mat = burgerkingMaterial; // rechter buurmerk
      const mesh = new THREE.Mesh(tileGeometry, mat);
      wallGroup.add(mesh);
      tiles.push(mesh);
    }

    // Wijs tegels willekeurig toe aan groepen zodat ze in vluchten van 4 invliegen
    // in plaats van allemaal tegelijk of één voor één.
    const GROUP_SIZE = 4;
    const shuffled = Array.from({ length: TILE_COUNT }, (_, i) => i).sort(
      () => Math.random() - 0.5,
    );
    const tileGroup = new Array(TILE_COUNT);
    shuffled.forEach((idx, pos) => {
      tileGroup[idx] = Math.floor(pos / GROUP_SIZE);
    });

    // Sla per tegel de animatieparameters op: groep, vliegduur en startrand.
    const tileRng = tiles.map((_, i) => ({
      group:    tileGroup[i],
      duration: WALL_ENTRANCE_DURATION_MIN + Math.random() * WALL_ENTRANCE_DURATION_VARIANCE,
      edge:     Math.floor(Math.random() * 4), // 0=links 1=rechts 2=boven 3=onder
      edgeT:    (Math.random() - 0.5) * 1.6,  // positie langs de rand
    }));

    // ── Brand wall tile (de platte tegel die in de muur zit na invoeging) ──

    // Dit is een aparte mesh die zichtbaar wordt als de zwevende tegel in de muur "valt".
    let currentBrandWallTile = new THREE.Mesh(
      tileGeometry,
      currentBrandMaterial.clone(),
    );
    currentBrandWallTile.material.opacity = 0; // begint onzichtbaar
    currentBrandWallTile.position.z = 0.05;
    wallGroup.add(currentBrandWallTile);

    // ── Floating tile (de 3D-doos waarmee de gebruiker interageert) ───────────

    // De materiaalvolgorde voor een BoxGeometry: [links, rechts, boven, onder, voor, achter].
    // Vlak 4 (voor) = merkafbeelding, vlak 5 (achter) = achterkant-textuur.
    const floatingMaterials = [
      ceramicSideMaterial.clone(),
      ceramicSideMaterial.clone(),
      ceramicSideMaterial.clone(),
      ceramicSideMaterial.clone(),
      currentBrandMaterial.clone(),
      tileBackMaterial.clone(),
    ];
    floatingMaterials.forEach((m) => { m.transparent = true; });
    floatingMaterials[4].opacity    = 1; // branded vlak is altijd volledig zichtbaar, locked plate zit er bovenop
    floatingMaterials[4].depthWrite = true; // occludeert stralen zodra het voor-vlak opaque is
    floatingMaterials[5].opacity    = 0;

    let floatingTile = new THREE.Mesh(floatingTileGeometry, floatingMaterials);
    floatingTile.position.z = 0.07;
    floatingTile.renderOrder = 3;
    floatingTile.visible = false;
    scene.add(floatingTile);
    floatingTileRef.current = floatingTile;

    // ── Idle glow (gouden halo achter de vergrendelde tegel) ──────────────────

    // Een radiaal kleurverloop dat pulserende licht simuleert terwijl de gebruiker
    // nog niet geklikt heeft ("adem" effect).
    const glowCanvas = document.createElement("canvas");
    glowCanvas.width = 256;
    glowCanvas.height = 256;
    const glowCtx = glowCanvas.getContext("2d");
    const glowGrad = glowCtx.createRadialGradient(128, 128, 0, 128, 128, 128);
    glowGrad.addColorStop(0, "rgba(210, 150, 10, 0.9)");
    glowGrad.addColorStop(0.35, "rgba(190, 120,  5, 0.5)");
    glowGrad.addColorStop(0.65, "rgba(160,  90,  0, 0.15)");
    glowGrad.addColorStop(1.0, "rgba(120,  60,  0, 0.0)");
    glowCtx.fillStyle = glowGrad;
    glowCtx.fillRect(0, 0, 256, 256);

    const idleGlowMaterial = new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(glowCanvas),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.NormalBlending,
      toneMapped: false,
    });
    const idleGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      idleGlowMaterial,
    );
    idleGlow.position.z = -0.01;
    idleGlow.renderOrder = 2;
    floatingTile.add(idleGlow); // kind van floatingTile zodat hij meebeweegt

    // ── Rotatie-indicator: twee losse halve ellips-bogen met pijlpunten ─────────
    // Elk ~150° boog, gap van ~30° aan beide kanten, zodat je duidelijk twee
    // losse pijlen ziet. Plat liggend onder de tegel, sterk naar camera gekanteld.

    // Twee materialen: boog iets transparanter, cone solide zodat ze geen strepen door elkaar geven
    const rotMatArc  = new THREE.MeshBasicMaterial({ color: 0x4a6abf, transparent: true, opacity: 0, depthWrite: true, toneMapped: false });
    const rotMatCone = new THREE.MeshBasicMaterial({ color: 0x4a6abf, transparent: true, opacity: 0, depthWrite: true, toneMapped: false });

    const rotRingGroup = new THREE.Group();
    const rx = 0.55, ry = 0.15, tube = 0.004;

    function buildEllipseArc(startA, endA, segments) {
      const pts = [];
      for (let i = 0; i <= segments; i++) {
        const a = startA + (endA - startA) * (i / segments);
        pts.push(new THREE.Vector3(rx * Math.cos(a), ry * Math.sin(a), 0));
      }
      const path = new THREE.CatmullRomCurve3(pts);
      return new THREE.TubeGeometry(path, segments, tube, 8, false);
    }

    const gap = 0.62;
    const arcMesh1 = new THREE.Mesh(buildEllipseArc(gap, Math.PI - gap, 40), rotMatArc);
    const arcMesh2 = new THREE.Mesh(buildEllipseArc(Math.PI + gap, Math.PI * 2 - gap, 40), rotMatArc);
    arcMesh1.renderOrder = 7;
    arcMesh2.renderOrder = 7;
    rotRingGroup.add(arcMesh1);
    rotRingGroup.add(arcMesh2);

    // Pijlpunt boog 1
    // Tangent op a1: richting = (−rx·sin(a1), ry·cos(a1)), genormaliseerd
    const coneR = 0.010, coneH = 0.048;
    const a1 = Math.PI - gap;
    const tx1 = -rx * Math.sin(a1), ty1 = ry * Math.cos(a1);
    const tlen1 = Math.sqrt(tx1 * tx1 + ty1 * ty1);
    const tn1x = tx1 / tlen1, tn1y = ty1 / tlen1; // genormaliseerde tangent
    const cone1 = new THREE.Mesh(new THREE.ConeGeometry(coneR, coneH, 12), rotMatCone);
    // Center van cone = boog-uiteinde + (coneH/2) langs tangent (punt zit aan boog-kant)
    cone1.position.set(rx * Math.cos(a1) + tn1x * (coneH / 2), ry * Math.sin(a1) + tn1y * (coneH / 2), 0);
    cone1.rotation.z = Math.atan2(tn1y, tn1x) - Math.PI / 2;
    cone1.renderOrder = 8;
    rotRingGroup.add(cone1);

    // Pijlpunt boog 2
    const a2 = Math.PI * 2 - gap;
    const tx2 = -rx * Math.sin(a2), ty2 = ry * Math.cos(a2);
    const tlen2 = Math.sqrt(tx2 * tx2 + ty2 * ty2);
    const tn2x = tx2 / tlen2, tn2y = ty2 / tlen2;
    const cone2 = new THREE.Mesh(new THREE.ConeGeometry(coneR, coneH, 12), rotMatCone);
    cone2.position.set(rx * Math.cos(a2) + tn2x * (coneH / 2), ry * Math.sin(a2) + tn2y * (coneH / 2), 0);
    cone2.rotation.z = Math.atan2(tn2y, tn2x) - Math.PI / 2;
    cone2.renderOrder = 8;
    rotRingGroup.add(cone2);

    rotRingGroup.rotation.x = Math.PI * 0.22;
    rotRingGroup.renderOrder = 7;
    scene.add(rotRingGroup);

    function setArrowOpacity(val) { rotMatArc.opacity = val; rotMatCone.opacity = val; }

    // ── Locked plate overlay ──────────────────────────────────────────────────

    // De vergrendelingsoverlay die bovenop de tegel zit totdat de gebruiker klikt.
    let lockedPlate = new THREE.Mesh(tileGeometry, lockedMaterial.clone());
    lockedPlate.position.z = TILE_DEPTH / 2 + 0.008;
    lockedPlate.renderOrder = 6;
    floatingTile.add(lockedPlate);

    // ── Crack overlay (2D gebakken textuurversie van de barst) ────────────────

    // Wordt zichtbaar tijdens de intro terwijl de tegel "barst".
    let crackOverlay = new THREE.Mesh(
      tileGeometry,
      crackOverlayMaterial.clone(),
    );
    crackOverlay.position.z = TILE_DEPTH / 2 + 0.026;
    crackOverlay.renderOrder = 10;
    crackOverlay.visible = false;
    floatingTile.add(crackOverlay);

    // Flash-vlak: korte felle witte flits op het breukmoment
    flashOverlay.position.z  = TILE_DEPTH / 2 + 0.032;
    flashOverlay.scale.setScalar(1.08);
    floatingTile.add(flashOverlay);

    // ── Reveal shards (keramische scherven die wegvliegen bij ontgrendeling) ──

    const revealShards = [];

    const createShardMaterial = () => new THREE.ShaderMaterial({
      uniforms: {
        tileTexture:  { value: lockedTexture },
        crackTexture: { value: crackTexture },
        opacity:      { value: 0 },
        glowAmount:   { value: 0 }, // 0-1: hoe sterk het licht door de scheuren gloeit
      },
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform sampler2D tileTexture;
        uniform sampler2D crackTexture;
        uniform float opacity;
        uniform float glowAmount;

        void main() {
          vec4 tile        = texture2D(tileTexture, vUv);
          vec4 crackSample = texture2D(crackTexture, vUv);
          // Scheurwaarde uit helderste kanaal
          float crack     = max(crackSample.r, max(crackSample.g, crackSample.b));
          float crackLine = smoothstep(0.06, 0.48, crack);

          // Donkere scheur op de tegel
          tile.rgb = mix(tile.rgb, vec3(0.04, 0.08, 0.18), crackLine * 0.72);
          // Subtiele blauwe edge-highlight langs de scheurrand
          tile.rgb += vec3(0.15, 0.22, 0.38) * crackLine * 0.18;

          // Gouden lichtgloed door de scheuren (schemert net voor de breuk)
          vec3 goldGlow = vec3(1.0, 0.78, 0.22);
          float edgeGlow = smoothstep(0.35, 0.08, crack) * smoothstep(0.0, 0.12, crack);
          tile.rgb += goldGlow * edgeGlow * glowAmount * 1.4;

          tile.a *= opacity;
          gl_FragColor = tile;
        }
      `,
    });

    /**
     * Bouwt een platte scherfgeometrie van een array met {x, y} punten.
     * UV-coördinaten worden afgeleid uit de positie zodat de vergrendelingstextuur
     * correct geprojecteerd wordt.
     */
    const createShardGeometry = (pts) => {
      const geo = new THREE.BufferGeometry();
      const positions = new Float32Array(pts.flatMap((p) => [p.x, p.y, 0]));
      const uvs       = new Float32Array(pts.flatMap((p) => [
        THREE.MathUtils.clamp(p.x + 0.5, 0, 1),
        THREE.MathUtils.clamp(p.y + 0.5, 0, 1),
      ]));
      const indices = [];
      for (let i = 1; i < pts.length - 1; i++) indices.push(0, i, i + 1);
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('uv',       new THREE.BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      return geo;
    };

    const tileHalf = 0.515;
    const cornerPoints = [
      { t: 1, x: tileHalf, y: tileHalf },
      { t: 2, x: -tileHalf, y: tileHalf },
      { t: 3, x: -tileHalf, y: -tileHalf },
      { t: 4, x: tileHalf, y: -tileHalf },
    ];

    const pointOnSquareEdge = (angle) => {
      const x = Math.cos(angle);
      const y = Math.sin(angle);
      const scale = tileHalf / Math.max(Math.abs(x), Math.abs(y));
      return { x: x * scale, y: y * scale };
    };

    const edgeProgress = (p) => {
      const eps = 0.0001;
      if (Math.abs(p.x - tileHalf) < eps) return (p.y + tileHalf) / (tileHalf * 2);
      if (Math.abs(p.y - tileHalf) < eps) return 1 + (tileHalf - p.x) / (tileHalf * 2);
      if (Math.abs(p.x + tileHalf) < eps) return 2 + (tileHalf - p.y) / (tileHalf * 2);
      return 3 + (p.x + tileHalf) / (tileHalf * 2);
    };

    const boundaryPointsBetween = (from, to) => {
      const fromT = edgeProgress(from);
      let toT = edgeProgress(to);
      if (toT <= fromT) toT += 4;
      return cornerPoints
        .concat(cornerPoints.map((corner) => ({ ...corner, t: corner.t + 4 })))
        .filter((corner) => corner.t > fromT && corner.t < toT)
        .map((corner) => ({ x: corner.x, y: corner.y }));
    };

    const crackEdgePoints = (angle, edgePoint, side = 1) => {
      const perpendicular = angle + Math.PI / 2;
      return [0.22, 0.46, 0.72].map((t, index) => {
        const wobble = Math.sin(index * 1.9 + angle * 3.1) * 0.026 + (Math.random() - 0.5) * 0.035;
        return {
          x: edgePoint.x * t + Math.cos(perpendicular) * wobble * side,
          y: edgePoint.y * t + Math.sin(perpendicular) * wobble * side,
        };
      }).concat(edgePoint);
    };

    // Grote, onregelmatige sectoren volgen de hoofdbarsten naar de vierkante rand.
    // Dat oogt meer als gebroken keramiek dan concentrische ringen.
    const fractureCount = 8;
    const angleOffset = Math.random() * Math.PI * 2;
    const fractureAngles = Array.from({ length: fractureCount }, (_, i) => (
      angleOffset + (Math.PI * 2 * i) / fractureCount + (Math.random() - 0.5) * 0.18
    )).sort((a, b) => a - b);

    for (let i = 0; i < fractureCount; i++) {
      const a1 = fractureAngles[i];
      const a2 = i === fractureCount - 1 ? fractureAngles[0] + Math.PI * 2 : fractureAngles[i + 1];
      const edgeA = pointOnSquareEdge(a1);
      const edgeB = pointOnSquareEdge(a2);
      const center = { x: (Math.random() - 0.5) * 0.035, y: (Math.random() - 0.5) * 0.035 };
      const edgePathA = crackEdgePoints(a1, edgeA, 1);
      const edgePathB = crackEdgePoints(a2, edgeB, -1);
      const pts = [
        center,
        ...edgePathA,
        ...boundaryPointsBetween(edgeA, edgeB),
        ...edgePathB.slice(0, -1).reverse(),
      ];

      const shard = new THREE.Mesh(createShardGeometry(pts), createShardMaterial());
      shard.visible = false;
      const scx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
      const scy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
      const dx = scx + (Math.random() - 0.5) * 0.18;
      const dy = scy + (Math.random() - 0.5) * 0.18;
      const len = Math.hypot(dx, dy) || 1;
      shard.position.set(0, 0, TILE_DEPTH / 2 + 0.011 + i * 0.0008);
      shard.renderOrder = 7 + i;

      // Sla de vluchtvectoren op in userData zodat de animatielus ze kan lezen.
      shard.userData.baseX = 0;
      shard.userData.baseY = 0;
      shard.userData.centroidX = scx;
      shard.userData.centroidY = scy;
      // Explosieve break-krachten: sterker dan voorheen, met een extra willekeurige component
      const explosionPower = 1.0 + Math.random() * 0.6; // variatie per scherf
      shard.userData.breakX = (dx / len) * (6.5 + Math.random() * 4.5) * explosionPower;
      shard.userData.breakY = (dy / len) * (5.0 + Math.random() * 3.8) * explosionPower;
      shard.userData.breakZ = 1.2 + Math.random() * 1.4;          // sterker naar voren schieten
      shard.userData.exitZ  = -3.2 - Math.random() * 2.2;         // verder wegvliegen
      // Veel agressievere rotatie bij uitbarsting
      shard.userData.rotX = (Math.random() - 0.5) * 14.0;
      shard.userData.rotY = (Math.random() - 0.5) * 14.0;
      shard.userData.rotZ = (Math.random() - 0.5) * 16.0;
      // Stagger: buitenste scherven starten iets later (concentrisch effect)
      shard.userData.breakDelay = Math.hypot(scx, scy) * 0.08;
      revealShards.push(shard);
      floatingTile.add(shard);
    }

    // ── Reveal light rays (gouden lichtstralen bij ontgrendeling) ─────────────
    // Shader-gebaseerde stralen: zacht verlopend van helder goud in het midden
    // naar volledig transparant aan de randen en punt — geen harde knipranden.

    const createRayMaterial = () => new THREE.ShaderMaterial({
      uniforms: { opacity: { value: 0 } },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      side: THREE.DoubleSide,
      vertexShader: `
        attribute float aFade; // 0 = punt (transparant), 1 = basis (helder)
        varying float vFade;
        varying vec2 vUv;
        void main() {
          vFade = aFade;
          vUv   = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float opacity;
        varying float vFade;
        varying vec2 vUv;
        void main() {
          // Langs de lengte: vervaagt naar de punt (vUv.y = 1 = punt)
          float lenFade  = 1.0 - smoothstep(0.0, 1.0, vUv.y);
          lenFade = pow(lenFade, 0.55); // iets minder agressief afvlakken
          // Langs de breedte: zacht vervaagt naar de zijkanten (vUv.x = 0 of 1 = rand)
          float sideFade = 1.0 - abs(vUv.x * 2.0 - 1.0);
          sideFade = pow(sideFade, 0.42); // breed gloeiend midden
          // Extra kern-gloed: heldere streep langs de middenas
          float core = pow(sideFade, 4.0) * 0.9;
          float alpha = (sideFade * lenFade + core) * opacity;
          // Warme goud-naar-wit kleurovergang: kern is bijna wit, buitenrand dieper goud
          vec3 innerColor = vec3(1.0, 0.97, 0.78);  // bijna wit-goud
          vec3 outerColor = vec3(1.0, 0.72, 0.12);  // diep goud
          vec3 col = mix(outerColor, innerColor, pow(sideFade, 1.8) * lenFade);
          gl_FragColor = vec4(col * alpha, alpha);
        }
      `,
    });

    // Geometrie: een rechthoek met UV's zodat de shader de vervaging kan berekenen.
    // aFade loopt van 1 (basis, helder) naar 0 (punt, transparant).
    const createRayGeometry = () => {
      const geo = new THREE.PlaneGeometry(1, 1, 1, 8);
      // PlaneGeometry UV.y loopt van 0 (basis) naar 1 (punt) — dat is wat we willen.
      // aFade = 1 - uv.y zodat de basis helder is.
      const posArr  = geo.attributes.position.array;
      const uvArr   = geo.attributes.uv.array;
      const fadeArr = new Float32Array(posArr.length / 3);
      for (let v = 0; v < fadeArr.length; v++) {
        fadeArr[v] = 1.0 - uvArr[v * 2 + 1]; // 1 aan basis, 0 aan punt
      }
      geo.setAttribute('aFade', new THREE.BufferAttribute(fadeArr, 1));
      return geo;
    };

    const revealRays = [];
    const RAY_COUNT = 28; // meer stralen voor een voller lichteffect
    for (let i = 0; i < RAY_COUNT; i++) {
      const isLong   = i % 4 !== 3;
      const rLen     = isLong ? 2.6 + Math.random() * 2.4 : 1.2 + Math.random() * 1.2;
      const rW       = isLong ? 0.18 + Math.random() * 0.36 : 0.36 + Math.random() * 0.52;

      const geo = createRayGeometry();
      const mat = createRayMaterial();
      const ray = new THREE.Mesh(geo, mat);

      // Ankerpunt: straal groeit vanuit y=0, punt zit bij y=rLen
      // PlaneGeometry staat gecentreerd, dus verschuif het zodat de basis op y=0 zit
      ray.geometry.translate(0, 0.5, 0); // basis naar y=0, punt naar y=1

      ray.renderOrder    = 1;
      ray.userData.rLen      = rLen;
      ray.userData.rW        = rW;
      ray.userData.phase     = i * 0.18 + Math.random() * 0.55;
      ray.userData.baseScale = 0.7 + Math.random() * 0.6;
      ray.userData.rotSpeed  = (Math.random() - 0.5) * 0.08;
      ray.userData.initRotZ  = (i / RAY_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
      ray.visible = false;
      revealRays.push(ray);
      scene.add(ray);
    }

    // ── Mutable animation state ───────────────────────────────────────────────

    // Lay-outvariabelen die bijgewerkt worden bij een resize.
    let viewWidth = 10,
      viewHeight = 6;
    let tileWidth = 1,
      tileHeight = 1;
    let wallLeft = -5,
      wallTop = 3,
      wallWidth = 10,
      wallHeight = 6;
    let freeTileWidth = 1,
      freeTileHeight = 1;
    let targetX = 0,
      targetY = 0; // world-positie van de centrale muurslot
    let startX = 0,
      startY = 0; // rustpositie van de zwevende tegel
    let frameId = 0;

    // Toestandsvariabelen voor de invoeg-/extraheer-animatie.
    let progress = 0; // 0 = bij de gebruiker, 1 = in de muur
    let insertionStarted = false;
    let insertionFlightReleased = false;
    let inserted = false;
    let extracting = false;
    let extractProgress = 0;
    let impactTime = null; // tijdstip van inslag (voor naeffecten)
    let hasEverBeenInserted = false;

    // Toestandsvariabelen voor de intro-sequentie.
    let introProgress         = 0;
    let introActive           = true;
    let introFlightStarted    = false;
    let introSoundPlayed      = false;
    let introCrackGenerated   = false;
    let revealStageLightVisible = false;

    // Toestandsvariabelen voor de muur-ingangsanimatie.
    let wallEntranceActive    = false;
    let wallEntranceComplete  = false;
    let wallEntranceCompleteNotified = false;
    let wallEntranceStartedAt = 0;
    let glowStartTime         = -1;
    let arrowStartTime        = -1;
    let rayFadeStartTime      = -1; // tijdstip waarop de lichtstralen beginnen uit te faden
    let overlayOpacity        = FOCUS_OVERLAY_OPACITY;

    const flightDuration        = 3.15; // seconden voor de invoegvlucht
    const introDelay            = 5;    // seconden wachten voor de intro-animatie start
    const introAnimationDuration = 12.0; // seconden voor de volledige intro-animatie
    const introDuration         = introDelay + introAnimationDuration;

    // Pointer/drag-tracking.
    const pointer = { x: 0, y: 0, overTile: false };
    const hoverWorld = { x: 0, y: 0 };
    const targetRotation = { x: 0, y: 0 };
    const dragState    = { active: false, moved: false, lastX: 0, lastY: 0, rotationX: 0, rotationY: 0 };
    let userHasRotated = false; // blijft true zodra gebruiker ooit de tegel gedraaid heeft
    let hoveredWallTileIndex = -1;

    // Bijhouden welke tegels hun ripple-geluid al afgespeeld hebben na de inslag.
    const droppedTileSounds = new Set();

    // Handmatige klok (vervangt de verouderde THREE.Clock constructorshandtekening).
    let clockPrev = performance.now() / 1000;
    let clockElapsed = 0;

    // Retourneert de tijd (in seconden) verstreken sinds de laatste aanroep.
    const clockGetDelta = () => {
      const now = performance.now() / 1000;
      const delta = now - clockPrev;
      clockPrev = now;
      clockElapsed += delta;
      return delta;
    };

    /**
     * Reset de vorige tijdstempel zodat de volgende delta niet een grote sprong geeft.
     * Gebruikt bij click-events om de klok na een gebruikersactie opnieuw te synchroniseren.
     */
    const clockReset = () => {
      clockPrev = performance.now() / 1000;
    };

    // Zet de vignet-overlay aan zodra de scène start.
    onFocusOverlayChange?.(true);

    // ── Audio ─────────────────────────────────────────────────────────────────

    let audioContext = null;
    let dropBuffer = null;
    let audioLoading = false;

    /**
     * Laadt het dropsound-audiobestand lui in (alleen bij eerste aanroep).
     * Gebruikt de Web Audio API. webkitAudioContext is de fallback voor Safari.
     */
    const ensureDropSound = () => {
      const AC =
        window.AudioContext ||
        /** @type {typeof AudioContext | undefined} */ (
          /** @type {unknown} */ (window).webkitAudioContext
        );
      if (!AC || audioLoading || dropBuffer) return;
      audioLoading = true;
      audioContext = audioContext || new AC();
      fetch(DROP_SOUND)
        .then((r) => r.arrayBuffer())
        .then((buf) => audioContext.decodeAudioData(buf))
        .then((decoded) => {
          dropBuffer = decoded;
        })
        .catch(() => {
          dropBuffer = null;
        })
        .finally(() => {
          audioLoading = false;
        });
    };

    /**
     * Speelt het dropsound-effect af op het opgegeven volume (0–1).
     * Elke aanroep maakt een nieuw AudioBufferSource aan zodat overlappende
     * geluiden mogelijk zijn (bijv. bij meerdere tiles tegelijk).
     */
    const playDropSound = (volume = 0.045) => {
      if (!dropBuffer || !audioContext) return;
      const src = audioContext.createBufferSource();
      const gain = audioContext.createGain();
      src.buffer = dropBuffer;
      gain.gain.value = volume;
      src.connect(gain).connect(audioContext.destination);
      src.start();
    };

    /**
     * Stuurt een melding naar de bovenliggende component over de gouden lichtgloed,
     * maar alleen als de waarde werkelijk verandert (voorkomt onnodige re-renders).
     */
    const setRevealStageLight = (visible) => {
      if (revealStageLightVisible === visible) return;
      revealStageLightVisible = visible;
      onRevealLightChange?.(visible);
    };

    ensureDropSound();

    // ── Layout ────────────────────────────────────────────────────────────────

    /**
     * Herberekent alle world-space tegelposities voor de huidige canvasgrootte.
     * Aangeroepen bij het mounten en bij elke window-resize.
     * Gebruikt WALL_VIEWPORT om het raster correct te positioneren over de achtergrondafbeelding.
     */
    const layoutTiles = () => {
      const width = host.clientWidth || 1;
      const height = host.clientHeight || 1;
      const aspect = width / height;

      // De orthografische camera heeft altijd breedte 10; de hoogte schaalt mee.
      viewWidth = 10;
      viewHeight = viewWidth / aspect;
      wallLeft = -viewWidth / 2 + viewWidth * WALL_VIEWPORT.left;
      wallTop = viewHeight / 2 - viewHeight * WALL_VIEWPORT.top;
      wallWidth = viewWidth * WALL_VIEWPORT.width;
      wallHeight = viewHeight * WALL_VIEWPORT.height;
      tileWidth = wallWidth / TILE_COLS;
      tileHeight = wallHeight / TILE_ROWS;

      camera.left = -viewWidth / 2;
      camera.right = viewWidth / 2;
      camera.top = viewHeight / 2;
      camera.bottom = -viewHeight / 2;
      camera.updateProjectionMatrix();

      renderer.setSize(width, height, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      focusOverlay.scale.set(viewWidth, viewHeight, 1);
      unlockOverlay.scale.set(viewWidth, viewHeight, 1);

      tiles.forEach((mesh, i) => {
        const col = i % TILE_COLS;
        const row = Math.floor(i / TILE_COLS);

        // World-ruimtepositie van het middelpunt van deze tegel.
        const x = wallLeft + tileWidth * (col + 0.5);
        const y = wallTop - tileHeight * (row + 0.5);

        mesh.userData.baseX           = x;
        mesh.userData.baseY           = y;
        mesh.userData.entranceDelay   = 0.18 + tileRng[i].group * WALL_ENTRANCE_GROUP_DELAY;
        mesh.userData.entranceDuration = tileRng[i].duration;

        // Off-screen startpositie voor de invlieg-animatie (buiten het zichtbare vlak).
        const margin = 1.6;
        const { edge, edgeT } = tileRng[i];
        mesh.userData.fromX =
          edge === 0
            ? -viewWidth / 2 - margin
            : edge === 1
              ? viewWidth / 2 + margin
              : edgeT * viewWidth * 0.5;
        mesh.userData.fromY =
          edge === 2
            ? viewHeight / 2 + margin
            : edge === 3
              ? -viewHeight / 2 - margin
              : edgeT * viewHeight * 0.5;

        mesh.position.set(x, y, 0);
        mesh.scale.set(tileWidth, tileHeight, 1);

        if (i === CURRENT_BRAND_INDEX) {
          targetX = x;
          targetY = y;
          currentBrandWallTile.position.set(x, y, 0.05);
          currentBrandWallTile.scale.set(tileWidth, tileHeight, 1);
          currentBrandWallTile.userData.entranceDelay =
            mesh.userData.entranceDelay;
          currentBrandWallTile.userData.entranceDuration =
            mesh.userData.entranceDuration;
        }
      });

      // Rustpositie en -grootte van de zwevende tegel (geproportioneerd aan één tegel-slot).
      startX = 0;
      const freeTileBase = Math.min(tileWidth / TILE_ART_ASPECT, tileHeight);
      freeTileWidth = freeTileBase * TILE_ART_ASPECT;
      freeTileHeight = freeTileBase;
      startY = viewHeight * 0.1;

      if (!inserted && floatingTile) {
        if (introActive) {
          floatingTile.position.set(targetX, targetY, 0.07);
          floatingTile.scale.set(tileWidth, tileHeight, 1);
          floatingTile.userData.entranceDelay    = currentBrandWallTile.userData.entranceDelay    ?? 0.2;
          floatingTile.userData.entranceDuration = currentBrandWallTile.userData.entranceDuration ?? WALL_ENTRANCE_DURATION_MIN;
        } else {
          floatingTile.position.set(startX, startY, FREE_TILE_Z);
          floatingTile.scale.set(
            freeTileWidth * FREE_TILE_SCALE,
            freeTileHeight * FREE_TILE_SCALE,
            1,
          );
        }
      }
    };

    layoutTiles();
    window.addEventListener("resize", layoutTiles);

    // ── Pointer helpers ───────────────────────────────────────────────────────

    /**
     * Vertaalt een DOM-pointer-event naar orthografische world-coördinaten.
     * Houdt rekening met de positie en grootte van het host-element in de pagina.
     */
    const clientToWorld = (e) => {
      const rect = host.getBoundingClientRect();
      return {
        x: -viewWidth / 2 + ((e.clientX - rect.left) / rect.width) * viewWidth,
        y: viewHeight / 2 - ((e.clientY - rect.top) / rect.height) * viewHeight,
      };
    };

    /**
     * Controleert of een world-coördinaat binnen de bounding box van de zwevende tegel valt.
     */
    const isInsideFloatingTile = (world) => {
      const hw = (floatingTile.scale.x || tileWidth) / 2;
      const hh = (floatingTile.scale.y || tileHeight) / 2;
      return (
        Math.abs(world.x - floatingTile.position.x) <= hw &&
        Math.abs(world.y - floatingTile.position.y) <= hh
      );
    };

    /**
     * Geeft de rasterindex terug van de muurtegelonder `world`, of -1 als buiten het raster.
     */
    const getWallTileIndex = (world) => {
      const col = Math.floor((world.x - wallLeft) / tileWidth);
      const row = Math.floor((wallTop - world.y) / tileHeight);
      if (col < 0 || col >= TILE_COLS || row < 0 || row >= TILE_ROWS) return -1;
      return row * TILE_COLS + col;
    };

    // ── Pointer event handlers ────────────────────────────────────────────────

    // Bijwerken van pointer-positie, hover-status en cursor.
    const handlePointerMove = (e) => {
      const world = clientToWorld(e);

      if (inserted) {
        // Na invoeging: hover-tegel bijhouden voor het ripple-hover-effect op de muur.
        hoverWorld.x = world.x;
        hoverWorld.y = world.y;
        hoveredWallTileIndex = getWallTileIndex(world);
        host.style.cursor =
          hoveredWallTileIndex === CURRENT_BRAND_INDEX ? "pointer" : "default";
        return;
      }

      if (introActive) {
        // Tijdens de intro: pointer-cursor alleen als de tegel aanklikbaar is.
        host.style.cursor = !startIntroRef.current && lockedGlowEnabledRef.current && isInsideFloatingTile(world) ? 'pointer' : 'default';
        return;
      }

      if (insertionStarted || extracting) return;

      pointer.x = world.x;
      pointer.y = world.y;
      pointer.overTile = isInsideFloatingTile(world);

      if (dragState.active) {
        // Tijdens slepen: bereken de rotatiedelta uit de muisbeweging.
        const dx = e.clientX - dragState.lastX;
        const dy = e.clientY - dragState.lastY;
        dragState.lastX = e.clientX;
        dragState.lastY = e.clientY;
        if (Math.abs(dx) + Math.abs(dy) > 1) { dragState.moved = true; userHasRotated = true; }
        dragState.rotationY += dx * 0.012;
        dragState.rotationX += dy * 0.01;
        targetRotation.x = dragState.rotationX;
        targetRotation.y = dragState.rotationY;
        host.style.cursor = "grabbing";
        return;
      }

      if (pointer.overTile) {
        // Subtiele kanteling richting de muisaanwijzer terwijl de tegel wordt gehovered.
        const relX = THREE.MathUtils.clamp(
          (world.x - floatingTile.position.x) / (floatingTile.scale.x / 2),
          -1,
          1,
        );
        const relY = THREE.MathUtils.clamp(
          (world.y - floatingTile.position.y) / (floatingTile.scale.y / 2),
          -1,
          1,
        );
        targetRotation.y = dragState.rotationY + relX * 0.12;
        targetRotation.x = dragState.rotationX - relY * 0.08;
        host.style.cursor = "grab";
      } else {
        targetRotation.x = dragState.rotationX;
        targetRotation.y = dragState.rotationY;
        host.style.cursor = "pointer";
      }
    };

    // Start het slepen als de gebruiker op de zwevende tegel drukt.
    const handlePointerDown = (e) => {
      if (introActive || insertionStarted || inserted || extracting) return;
      const world = clientToWorld(e);
      if (!isInsideFloatingTile(world)) return;
      dragState.active = true;
      dragState.moved = false;
      dragState.lastX = e.clientX;
      dragState.lastY = e.clientY;
      host.setPointerCapture?.(e.pointerId); // zorg dat events doorkomen ook als de muis snel beweegt
      host.style.cursor = "grabbing";
    };

    // Stop het slepen bij loslaten; sla de huidige rotatie op als startpunt.
    const handlePointerUp = (e) => {
      if (!dragState.active) return;
      dragState.active = false;
      dragState.rotationX = floatingTile.rotation.x;
      dragState.rotationY = floatingTile.rotation.y;
      host.releasePointerCapture?.(e.pointerId);
      host.style.cursor = pointer.overTile ? "grab" : "pointer";
    };

    // Reset hover-staat als de cursor het host-element verlaat.
    const handlePointerLeave = () => {
      if (dragState.active) return;
      hoveredWallTileIndex = -1;
      pointer.overTile = false;
      targetRotation.x = dragState.rotationX;
      targetRotation.y = dragState.rotationY;
      host.style.cursor = "default";
    };

    const handleClick = (e) => {
      if (e.target.closest("[data-tile-download]")) return;

      const world = clientToWorld(e);

      if (introActive) {
        // Gebruiker klikt de zwevende tegel aan om de ontgrendelsequentie te starten.
        if (!startIntroRef.current && lockedGlowEnabledRef.current && isInsideFloatingTile(world)) {
          startIntroRef.current = true;
          introProgress = introDelay; // sla de wachttijd over zodat de animatie meteen begint
          ensureDropSound();
          audioContext?.resume?.();
          clockReset();
          onStartIntroRequest?.();
          host.style.cursor = "default";
        }
        return;
      }

      if (extracting) return;

      if (inserted) {
        // Gebruiker klikt de ingevoegde tegel aan om hem terug te trekken.
        if (getWallTileIndex(world) !== CURRENT_BRAND_INDEX) return;
        extracting = true;
        inserted = false;
        insertionStarted = false;
        insertionFlightReleased = false;
        extractProgress = 0;
        progress = 1;
        impactTime = null;
        hoveredWallTileIndex = -1;
        currentBrandWallTile.material.opacity = 0;
        floatingMaterials.forEach((m) => {
          m.opacity = 1;
        });
        targetRotation.x = 0;
        targetRotation.y = 0;
        dragState.rotationX = 0;
        dragState.rotationY = 0;
        setShowTileDownload(false);
        window.setTimeout(() => {
          onFocusOverlayChange?.(true);
          setShowUnlockOverlay(true);
        }, 260);
        host.style.cursor = "grab";
        return;
      }

      if (insertionStarted) return;
      if (dragState.moved) {
        dragState.moved = false;
        return;
      } // sleep was geen klik

      // Klik buiten de tegel: start de invoegvlucht.
      if (isInsideFloatingTile(world)) return;
      insertionStarted = true;
      insertionFlightReleased = false;
      progress = 0;
      setShowTileDownload(false);
      setShowUnlockOverlay(false);
      onFocusOverlayChange?.(false);
      ensureDropSound();
      audioContext?.resume?.();
      clockReset();
      targetRotation.x = 0;
      targetRotation.y = 0;
      host.style.cursor = "default";
    };

    host.addEventListener("pointerdown", handlePointerDown);
    host.addEventListener("pointermove", handlePointerMove);
    host.addEventListener("pointerup", handlePointerUp);
    host.addEventListener("pointercancel", handlePointerUp);
    host.addEventListener("pointerleave", handlePointerLeave);
    host.addEventListener("click", handleClick);

    // ── Animation loop ────────────────────────────────────────────────────────

    const animate = () => {
      frameId = window.requestAnimationFrame(animate);
      const delta = Math.min(clockGetDelta(), 0.04); // begrens delta zodat een hik de animaties niet verstoort
      const elapsed = clockElapsed;
      let revealDustPulse = 0; // stofpuls die alleen tijdens de intro-onthulling actief is

      // ── Wall entrance (tegels vliegen vanuit de rand de muur in) ──────────

      if (
        startWallEntranceRef.current &&
        !wallEntranceActive &&
        !wallEntranceComplete
      ) {
        wallEntranceActive = true;
        wallEntranceStartedAt = elapsed + 0.08; // kleine vertraging voor rust
        wallGroup.visible = true;
        floatingTile.visible = true;
        emptyMaterial.opacity =
          blankMaterial.opacity =
          ritualsMaterial.opacity =
          burgerkingMaterial.opacity =
            1;
        lockedPlate.material.opacity = 1;
        lockedPlate.visible = true;
        layoutTiles();
      }

      const wallEntranceElapsed = wallEntranceActive || wallEntranceComplete ? elapsed - wallEntranceStartedAt : -1;
      if (wallEntranceActive && wallEntranceElapsed > WALL_ENTRANCE_COMPLETE_AFTER) {
        wallEntranceActive   = false;
        wallEntranceComplete = true;
        layoutTiles();
        if (!wallEntranceCompleteNotified) {
          wallEntranceCompleteNotified = true;
          onWallEntranceComplete?.();
        }
        host.style.cursor = introActive && lockedGlowEnabledRef.current ? 'pointer' : 'default';
      }

      // ── Idle glow (ademende halo terwijl er gewacht wordt op klik) ────────

      if (introActive && !startIntroRef.current && floatingTile.visible && wallEntranceComplete && lockedGlowEnabledRef.current) {
        if (glowStartTime < 0) glowStartTime = elapsed;
        const glowElapsed = elapsed - glowStartTime;
        const fadeIn  = THREE.MathUtils.clamp(glowElapsed / 1.0, 0, 1);
        const breathe = (Math.sin(elapsed * 1.1 - Math.PI / 2) + 1) / 2; // sinus → [0, 1]
        idleGlowMaterial.opacity = fadeIn * (0.25 + breathe * 0.6);
        idleGlow.scale.setScalar(3.0 + breathe * 2.5);
        revealRays.forEach((r) => {
          r.visible = false;
        });
      }

      // Rotatie-pijlen: alleen in de vrij-fase (na intro, tegel groot voor camera, vóór insertie)
      if (!introActive && !insertionStarted && !inserted && !extracting && !hasEverBeenInserted && floatingTile.visible) {
        if (arrowStartTime < 0) arrowStartTime = elapsed;
        const arrowElapsed = elapsed - arrowStartTime;
        const fadeIn = THREE.MathUtils.clamp(arrowElapsed / 1.2, 0, 1);

        const pulsePeriod  = 7.0;  // totale periode
        const pulseOn      = 5.5;  // hoe lang zichtbaar per pulse
        const arrowDelay   = 0.5;
        const arrowT       = Math.max(0, arrowElapsed - arrowDelay);
        const pulsePhase   = arrowT % pulsePeriod;
        const pulseRaw     = pulsePhase < pulseOn ? Math.sin((pulsePhase / pulseOn) * Math.PI) : 0;
        const pulseCount   = Math.floor(arrowT / pulsePeriod);
        const arrowOpacity = pulseCount < 3 ? fadeIn * pulseRaw * 0.75 : 0;
        setArrowOpacity(arrowOpacity);

        // Tegel kantelt sterk links/rechts via targetRotation zodat het niet overschreven wordt
        // Kanteling gaat rustig door totdat gebruiker ooit de tegel zelf gedraaid heeft
        if (!dragState.active && !userHasRotated) {
          targetRotation.y = Math.sin(arrowElapsed * 0.4) * 0.55;
        }

        // Ring schalen naar werkelijke tegelgrootte, onder de tegel plaatsen
        const tileScaleX = floatingTile.scale.x;
        const tileScaleY = floatingTile.scale.y;
        rotRingGroup.scale.setScalar(tileScaleX * 1.05);
        rotRingGroup.position.set(
          floatingTile.position.x,
          floatingTile.position.y - tileScaleY * 0.75,  // ruim onder de tegel
          floatingTile.position.z + 0.05,
        );
      } else {
        setArrowOpacity(0);
        arrowStartTime = -1;
      }

      // ── Tile entrance animation (zweef naar muurpositie) ──────────────────

      if (
        introActive &&
        !startIntroRef.current &&
        floatingTile.visible &&
        wallEntranceActive
      ) {
        const localT = THREE.MathUtils.clamp(
          (wallEntranceElapsed - (floatingTile.userData.entranceDelay ?? 0.2)) /
            (floatingTile.userData.entranceDuration ?? 1.4),
          0,
          1,
        );
        const ease = smootherStep(localT);
        const flyFromY = -viewHeight / 2 - 1.6;
        const floatArc = Math.sin(localT * Math.PI);
        const bob = Math.sin(wallEntranceElapsed * 2.1) * 0.055 * floatArc;
        floatingTile.position.set(targetX, THREE.MathUtils.lerp(flyFromY, targetY, ease) + bob, 0.07 + floatArc * 0.1);
        floatingTile.rotation.set(
          (1 - ease) * -0.2 + Math.sin(wallEntranceElapsed * 1.45) * 0.045 * floatArc,
          (1 - ease) * 0.14 + Math.cos(wallEntranceElapsed * 1.25) * 0.04 * floatArc,
          (1 - ease) * 0.055 + Math.sin(wallEntranceElapsed * 1.75) * 0.035 * floatArc,
        );
        floatingTile.scale.set(tileWidth, tileHeight, 1);
        floatingMaterials.forEach((m) => {
          m.opacity = 1;
        });
        if (lockedPlate) {
          lockedPlate.material.opacity = ease;
          lockedPlate.visible = ease > 0.01;
        }
      }

      // ── Intro sequence (tegel vliegt uit, barst, onthult merkafbeelding) ──

      if (introActive && startIntroRef.current) {
        idleGlowMaterial.opacity = 0;
        setArrowOpacity(0);
        revealRays.forEach((r) => { r.visible = false; r.material.uniforms.opacity.value = 0; });
        if (!introCrackGenerated) {
          introCrackGenerated = true;
          crackMask.regenerate();
          crackMask.update(0);
        }

        introProgress = Math.min(introDuration, introProgress + delta);
        const introT  = THREE.MathUtils.clamp((introProgress - introDelay) / introAnimationDuration, 0, 1);

        // ── Fasedefinities (genormaliseerd naar introT [0,1]) ─────────────────
        // approachT : tegel vliegt naar voren naar de camera
        // crackT    : barsten groeien langzaam vanuit het midden
        // glowT     : gouden gloed sijpelt door de scheuren (vlak voor breuk)
        // breakT    : scherven exploderen naar buiten
        // flashT    : felle witte flits op het breukmoment
        // revealT   : merkafbeelding verschijnt
        // fadeOutT  : vergrendelingsoverlay vervaagt
        // lightT    : gouden lichtstralen waaieren open
        const approachT   = THREE.MathUtils.clamp(introT / 0.27, 0, 1);
        const approachEase = easeInOutCubic(approachT);
        const crackT      = THREE.MathUtils.clamp((introT - 0.24) / 0.46, 0, 1); // sneller groeiende barsten
        const glowT       = THREE.MathUtils.clamp((introT - 0.60) / 0.18, 0, 1); // licht door scheuren
        const breakT      = THREE.MathUtils.clamp((introT - 0.78) / 0.06, 0, 1); // snellere, krachtigere breuk
        const flashT      = THREE.MathUtils.clamp((introT - 0.78) / 0.08, 0, 1); // felle flits
const fadeOutT    = THREE.MathUtils.clamp((introT - 0.79) / 0.10, 0, 1);
        const lightT      = THREE.MathUtils.clamp((introT - 0.72) / 0.36, 0, 1);

        // Geluidje precies bij het breukmoment
        if (breakT > 0.05 && !introSoundPlayed && dropBuffer) {
          introSoundPlayed = true;
          audioContext?.resume?.();
          playDropSound(0.12); // iets harder: dramatischer breukgeluid
        }

        if (approachT > 0.03 && !introFlightStarted) {
          introFlightStarted = true;
          onFocusOverlayChange?.(true);
        }

        setRevealStageLight(lightT > 0.06 && introT < 0.97);

        // Achterkant fade in (branded vlak is altijd op volle opaciteit)
        floatingMaterials[5].opacity = smootherStep(approachT);

        // Vergrendeling vervaagt weg
        if (lockedPlate) {
          lockedPlate.material.opacity = 1 - smootherStep(fadeOutT);
          lockedPlate.visible = lockedPlate.material.opacity > 0.01;
        }

        // Gloed-waarde voor shard-shader en crack-textuur (goud door scheuren)
        const glowAmt = smootherStep(glowT) * (1 - smootherStep(THREE.MathUtils.clamp(breakT * 3, 0, 1)));

        // 2D barst-overlay met gouden gloed door de scheuren
        if (crackOverlay) {
          const ot      = smootherStep(crackT);
          crackMask.update(ot, glowAmt);
          // Overlay wordt snel onzichtbaar zodra de scherven exploderen
          const breakFade = Math.max(0, 1 - smootherStep(THREE.MathUtils.clamp(breakT / 0.35, 0, 1)));
          crackOverlay.material.opacity = (0.18 + ot * 1.05) * breakFade;
          crackOverlay.visible          = crackOverlay.material.opacity > 0.01;
          crackOverlay.scale.setScalar(1.0);
        }

        // Flits-overlay: korte felle flash op het breukmoment
        if (flashOverlay) {
          // Piek bij breakT ~0.3, dan snel wegdampen
          const flashPeak  = Math.sin(THREE.MathUtils.clamp(flashT, 0, 1) * Math.PI);
          flashOverlay.material.opacity = flashPeak * 0.85;
          flashOverlay.visible          = flashOverlay.material.opacity > 0.005;
          // Flash schaal past aan de tegelgrootte aan
          flashOverlay.scale.set(1.12, 1.12, 1);
        }

        // Scherven exploderen krachtig naar buiten
        revealShards.forEach((shard, i) => {
          // Stagger: buitenste scherven volgen iets later (centrifugaal effect)
          const delay = (shard.userData.breakDelay ?? 0) + (i % 4) * 0.022;
          const shatterElapsed = Math.max(0, (introT - 0.78) * introAnimationDuration - delay);
          const shardT    = THREE.MathUtils.clamp(shatterElapsed / 2.2, 0, 1); // sneller wegvliegen
          // Kubus-ease voor snelle start, dan uitfaden
          const shardEase = shardT < 0.5
            ? 4 * shardT * shardT * shardT
            : 1 - ((-2 * shardT + 2) ** 3) / 2;

          // Kleine trilling vlak voor de breuk (spanning opbouwen)
          const preCrack  = Math.sin(elapsed * 38 + i * 1.1) * glowT * 0.018;
          // Explosieve uitschietbeweging
          const launch    = shardEase ** 0.72;
          // Verder doorvliegen + wegzakken na de initiële explosie
          const exit      = Math.max(0, shatterElapsed - 0.7) * 0.28;
          const blast     = launch + exit;
          // Organisch fladderen terwijl de scherf wegvliegt
          const flutter   = Math.sin(elapsed * 5.8 + i * 1.3) * 0.009 * Math.min(blast, 1.8);

          shard.position.x = shard.userData.baseX + shard.userData.breakX * blast + preCrack + flutter;
          shard.position.y = shard.userData.baseY + shard.userData.breakY * blast - preCrack * 0.5 + flutter * 0.55;
          shard.position.z = TILE_DEPTH / 2 + 0.011 + shard.userData.breakZ * launch + shard.userData.exitZ * exit;
          shard.rotation.set(
            shard.userData.rotX * blast + flutter * 1.2,
            shard.userData.rotY * blast,
            shard.userData.rotZ * blast + preCrack * 2,
          );

          // Scherven krimpen iets terwijl ze wegvliegen
          const shrink = 1 - THREE.MathUtils.clamp(exit * 0.22, 0, 0.65);
          shard.scale.setScalar(shrink);

          // Opaciteit: plotseling verschijnen op breukmoment, dan snel verdwijnen
          const shardVisible   = shatterElapsed > 0;
          const shardFadeStart = 0.92;
          const shardFadeOut   = THREE.MathUtils.clamp((introT - shardFadeStart) / 0.07, 0, 1);
          const shardOpacity   = shardVisible ? Math.max(0, 1 - smootherStep(shardFadeOut)) : 0;
          shard.material.uniforms.opacity.value    = shardOpacity;
          shard.material.uniforms.glowAmount.value = Math.max(0, glowAmt - shardT); // gloed verdwijnt zodra scherf wegvliegt
          shard.visible = shardOpacity > 0.01;
        });

        // Gouden lichtstralen: krachtiger burst bij breuk, dan rustig nagloeiend
        // Stralen worden als scene-kind bijgehouden; positie/rotatie syncen met floatingTile.
        revealRays.forEach((ray) => {
          const burstPeak   = Math.sin(THREE.MathUtils.clamp(lightT * 2.2, 0, Math.PI));
          const sustainFade = Math.max(0, 1 - smootherStep(THREE.MathUtils.clamp((introT - 0.86) / 0.22, 0, 1)));
          const pulse       = Math.sin(lightT * Math.PI * 1.4 + ray.userData.phase) * 0.5 + 0.5;
          const baseOpacity = burstPeak * 0.58 + pulse * sustainFade * 0.22;
          const rayOpacity  = lightT > 0 ? baseOpacity * sustainFade : 0;
          ray.material.uniforms.opacity.value = rayOpacity;
          const scaleT = smootherStep(Math.min(lightT * 1.8, 1));
          const rW  = ray.userData.rW  * ray.userData.baseScale * (0.12 + scaleT * 0.92);
          const rLen = ray.userData.rLen * ray.userData.baseScale * (0.18 + scaleT * 1.2);
          ray.scale.set(rW, rLen, 1);
          // Positie: midden van de tegel, iets achter het voor-oppervlak
          ray.position.set(
            floatingTile.position.x,
            floatingTile.position.y,
            floatingTile.position.z - 0.01,
          );
          ray.rotation.x = floatingTile.rotation.x;
          ray.rotation.y = floatingTile.rotation.y;
          ray.rotation.z = (ray.userData.initRotZ ?? 0) + elapsed * (ray.userData.rotSpeed ?? 0.05);
          ray.visible = rayOpacity > 0.005;
        });

        // Schudbeweging op het breukmoment: snelle hevige shake
        const shakePulse = Math.sin(THREE.MathUtils.clamp(breakT, 0, 1) * Math.PI)
          * Math.max(0, 1 - THREE.MathUtils.clamp((introT - 0.86) / 0.10, 0, 1));
        revealDustPulse  = Math.sin(THREE.MathUtils.clamp(breakT, 0, 1) * Math.PI) * 0.52;

        floatingTile.position.set(
          THREE.MathUtils.lerp(targetX, startX, approachEase) + Math.sin(elapsed * 72) * 0.042 * shakePulse,
          THREE.MathUtils.lerp(targetY, startY, approachEase) + Math.sin(approachT * Math.PI) * tileHeight * 0.45 + Math.cos(elapsed * 63) * 0.032 * shakePulse,
          THREE.MathUtils.lerp(0.07, FREE_TILE_Z, approachEase),
        );
        floatingTile.scale.set(
          THREE.MathUtils.lerp(
            tileWidth,
            freeTileWidth * FREE_TILE_SCALE,
            smootherStep(approachT),
          ),
          THREE.MathUtils.lerp(
            tileHeight,
            freeTileHeight * FREE_TILE_SCALE,
            smootherStep(approachT),
          ),
          1,
        );
        floatingTile.rotation.set(0, Math.sin(approachT * Math.PI) * 0.08, 0);

        // Intro afgerond: ruim alle effectobjecten op
        if (introProgress >= introDuration) {
          introActive = false;
          introFlightStarted = false;
          onIntroComplete?.();
          setRevealStageLight(false);
          floatingMaterials[4].opacity = floatingMaterials[5].opacity = 1;
          if (lockedPlate) lockedPlate.visible = false;
          if (flashOverlay) { flashOverlay.visible = false; flashOverlay.material.opacity = 0; }
          revealShards.forEach((obj) => {
            obj.visible = false;
            obj.material.uniforms.opacity.value = 0;
          });
          rayFadeStartTime = elapsed; // stralen faden zelfstandig door buiten dit blok
          if (crackOverlay) { crackOverlay.visible = false; crackOverlay.material.opacity = 0; }
          host.style.cursor = pointer.overTile ? 'grab' : 'pointer';
        }
      }

      // ── Reveal ray fade (loopt door na het einde van de intro) ───────────
      // rayFadeStartTime wordt gezet zodra introActive false wordt.
      // De stralen faden over 2.5s uit zodat er nooit een harde cut is.
      if (rayFadeStartTime >= 0) {
        const rayElapsed = elapsed - rayFadeStartTime;
        const rayFade    = Math.max(0, 1 - smootherStep(THREE.MathUtils.clamp(rayElapsed / 2.5, 0, 1)));
        revealRays.forEach((ray) => {
          const prevOpacity = ray.material.uniforms.opacity.value;
          const newOpacity  = prevOpacity * rayFade;
          ray.material.uniforms.opacity.value = newOpacity;
          // Blijf positie syncen met de tegel zodat ze nooit buiten beeld zweven
          ray.position.set(floatingTile.position.x, floatingTile.position.y, floatingTile.position.z - 0.01);
          ray.rotation.x = floatingTile.rotation.x;
          ray.rotation.y = floatingTile.rotation.y;
          ray.rotation.z = (ray.userData.initRotZ ?? 0) + elapsed * (ray.userData.rotSpeed ?? 0.05);
          ray.visible    = newOpacity > 0.005;
        });
        if (rayFade <= 0) {
          revealRays.forEach((r) => { r.visible = false; r.material.uniforms.opacity.value = 0; });
          rayFadeStartTime = -1;
        }
      }

      // ── Insertion flight (tegel reist van hand naar muurslot) ─────────────

      if (insertionStarted && !inserted) {
        // Damp de overlay-opaciteit richting 0; laat de vlucht pas starten als de overlay weg is.
        overlayOpacity = THREE.MathUtils.damp(overlayOpacity, 0, 7, delta);
        if (overlayOpacity < 0.015) insertionFlightReleased = true;
        if (insertionFlightReleased)
          progress = Math.min(1, progress + delta / flightDuration);
      }

      // ── Extraction (tegel trekt terug uit de muur) ────────────────────────

      if (extracting) {
        extractProgress = Math.min(1, extractProgress + delta / 1.85);
        progress = 1 - easeInOutCubic(extractProgress); // omkeer: van 1 terug naar 0
        if (extractProgress > 0.18)
          overlayOpacity = THREE.MathUtils.damp(
            overlayOpacity,
            FOCUS_OVERLAY_OPACITY,
            2.8,
            delta,
          );
        if (extractProgress >= 1) {
          // Extractie voltooid: reset alle toestandsvariabelen.
          extracting =
            insertionStarted =
            insertionFlightReleased =
            inserted =
              false;
          progress = extractProgress = 0;
          targetRotation.x =
            targetRotation.y =
            dragState.rotationX =
            dragState.rotationY =
              0;
          droppedTileSounds.clear();
          setShowTileDownload(true);
        }
      }

      // ── Overlay opacity ───────────────────────────────────────────────────

      // Tijdens unlock-animatie: overlay omhoog naar 0.72. Na afloop zacht naar 0 faden.
      // externalOverlay stuurt de vignette in andere fasen (gebouw-ingang e.d.).
      const unlockDimTarget = unlockDimRef.current ? 0.72
        : externalOverlayRef.current                ? FOCUS_OVERLAY_OPACITY
        : 0;

      if (!insertionStarted && !inserted && !extracting) overlayOpacity = THREE.MathUtils.damp(overlayOpacity, unlockDimTarget, 3, delta);
      if (inserted) overlayOpacity = THREE.MathUtils.damp(overlayOpacity, 0, 5, delta);

      overlayMaterial.opacity = overlayOpacity;
      focusOverlay.visible    = overlayOpacity > 0.003 && wallEntranceComplete;

      // ── Floating tile transform ───────────────────────────────────────────

      const eased = easeInOutCubic(progress);
      const settle = smootherStep(progress);
      const arc = Math.sin(progress * Math.PI); // boogvorm: hoogste punt halverwege
      const drift =
        insertionStarted && !extracting
          ? Math.sin(elapsed * 1.35) * (1 - settle) * 0.035
          : 0; // zachte zweefbeweging

      if (!introActive) {
        floatingTile.position.set(
          THREE.MathUtils.lerp(startX, targetX, eased) + drift,
          THREE.MathUtils.lerp(startY, targetY, eased) +
            arc * tileHeight * 0.52,
          THREE.MathUtils.lerp(FREE_TILE_Z, 0.07, eased),
        );
        floatingTile.rotation.x = THREE.MathUtils.damp(
          floatingTile.rotation.x,
          insertionStarted || extracting ? 0 : targetRotation.x,
          10,
          delta,
        );
        floatingTile.rotation.y = THREE.MathUtils.damp(
          floatingTile.rotation.y,
          insertionStarted || extracting ? 0 : targetRotation.y,
          10,
          delta,
        );
        floatingTile.rotation.z = 0;
        floatingTile.scale.set(
          THREE.MathUtils.lerp(
            freeTileWidth * FREE_TILE_SCALE,
            tileWidth,
            settle,
          ),
          THREE.MathUtils.lerp(
            freeTileHeight * FREE_TILE_SCALE,
            tileHeight,
            settle,
          ),
          1,
        );
      }

      // Alle materialen van de zwevende tegel vervagen zodra de tegel de muur raakt.
      floatingMaterials.forEach((mat, i) => {
        if (introActive && (i === 4 || i === 5)) { mat.transparent = true; return; }
        mat.opacity = inserted ? Math.max(0, 1 - (elapsed - impactTime) * 3.2) : 1;
        // Alleen transparent als de opaciteit werkelijk < 1 is — bij opacity 1 gaat het
        // materiaal naar de opaque pass en occludeert het de lichtstralen correct.
        mat.transparent = mat.opacity < 1;
        if (i === 4 || i === 5) mat.transparent = mat.opacity < 0.999;
      });

      // Snap de ingevoegde toestand als de vlucht zijn eindpunt bereikt.
      if (insertionStarted && !extracting && !inserted && progress >= 1) {
        inserted = true;
        hasEverBeenInserted = true;
        impactTime = elapsed;
        onTileImpact?.();
        onTileInserted?.();
        currentBrandWallTile.material.opacity = 1; // muurversie van de tegel verschijnt
      }

      // ── Particles & shockwave ────────────────────────────────────────────

      // Na de inslag: deeltjes uitzwermen vanuit het insertiepunt.
      // Vóór de inslag: deeltjes volgen de zwevende tegel (intro-dust).
      const impactLife = impactTime == null ? -1 : elapsed - impactTime;
      const particlePulse =
        impactLife > 0 ? Math.exp(-impactLife * 0.95) : revealDustPulse;
      particles.position.set(
        impactLife > 0 ? targetX : floatingTile.position.x,
        (impactLife > 0 ? targetY : floatingTile.position.y) +
          Math.sin(elapsed * 0.2) * 0.025,
        0.02,
      );
      particles.rotation.z =
        Math.sin(elapsed * 0.32) * 0.08 + Math.max(0, impactLife) * 0.18;
      particles.scale.setScalar(
        impactLife > 0
          ? 0.46 + Math.min(impactLife, 2.8) * 0.62
          : 0.58 + revealDustPulse * 0.85,
      );
      particleMaterial.opacity = particlePulse * (impactLife > 0 ? 0.58 : 0.5);
      particleMaterial.size =
        0.015 + particlePulse * (impactLife > 0 ? 0.03 : 0.022);

      // Schokgolf uitdijt vanuit het insertiepunt gedurende 3,2 seconden.
      if (impactLife > 0 && impactLife < 3.2) {
        shockwave.position.set(targetX, targetY, shockwave.position.z);
        shockwave.scale.setScalar(0.14 + impactLife * 2.45);
        shockwaveMaterial.opacity = Math.max(0, 0.34 * (1 - impactLife / 3.2));
      } else {
        shockwaveMaterial.opacity = 0;
      }

      // ── Wall tile ripple & hover ──────────────────────────────────────────

      const centerCol = CURRENT_BRAND_INDEX % TILE_COLS;
      const centerRow = Math.floor(CURRENT_BRAND_INDEX / TILE_COLS);

      tiles.forEach((mesh, i) => {
        const col = i % TILE_COLS;
        const row = Math.floor(i / TILE_COLS);
        const dist = Math.hypot(col - centerCol, row - centerRow); // afstand tot de centrale tegel
        const waveT = impactLife > 0 ? impactLife * 1.85 : -1;
        const wave =
          impactLife > 0 ? Math.max(0, 1 - Math.abs(waveT - dist) * 0.72) : 0; // ripple-puls
        const damp = Math.exp(Math.max(0, impactLife) * -0.38); // demping over de tijd
        const tremor = Math.sin(impactLife * 25 + dist * 2.2) * wave * damp; // trilling
        const radialX =
          col === centerCol && row === centerRow
            ? 0
            : (col - centerCol) / Math.max(dist, 1);
        const radialY =
          col === centerCol && row === centerRow
            ? 0
            : (row - centerRow) / Math.max(dist, 1);

        // Speel een zacht tik-geluidje als de schokgolf de tegel bereikt.
        if (
          impactLife > 0 &&
          waveT - dist > 0.42 &&
          !droppedTileSounds.has(i)
        ) {
          droppedTileSounds.add(i);
          playDropSound(i === CURRENT_BRAND_INDEX ? 0.055 : 0.032);
        }

        // Hover-effect: tegel kantelt richting de muis als erover gehovered wordt.
        const hover = inserted && hoveredWallTileIndex === i ? 1 : 0;
        const tremble = hover ? Math.sin(elapsed * 28 + i * 0.7) * 0.04 : 0;
        let hRX = 0,
          hRY = 0,
          hRZ = 0;
        if (hover) {
          const relX = THREE.MathUtils.clamp(
            (hoverWorld.x - mesh.userData.baseX) / (tileWidth / 2),
            -1,
            1,
          );
          const relY = THREE.MathUtils.clamp(
            (hoverWorld.y - mesh.userData.baseY) / (tileHeight / 2),
            -1,
            1,
          );
          hRY = relX * 0.42 + tremble * 0.82;
          hRX = -relY * 0.31 + tremble * 0.62;
          hRZ = Math.sin(elapsed * 22 + i) * 0.014;
        }

        // Invlieg-animatie: interpoleer van off-screen startpositie naar doelpositie.
        let ePX = mesh.userData.baseX, ePY = mesh.userData.baseY, ePZ = 0, eRX = 0, eRY = 0, eRZ = 0;
        if (!wallEntranceComplete) {
          const localT = THREE.MathUtils.clamp((wallEntranceElapsed - mesh.userData.entranceDelay) / mesh.userData.entranceDuration, 0, 1);
          const ease   = smootherStep(localT);
          const floatArc = Math.sin(localT * Math.PI);
          ePX = THREE.MathUtils.lerp(mesh.userData.fromX ?? mesh.userData.baseX, mesh.userData.baseX, ease);
          ePY = THREE.MathUtils.lerp(mesh.userData.fromY ?? mesh.userData.baseY, mesh.userData.baseY, ease)
            + Math.sin(wallEntranceElapsed * 1.65 + i * 0.61) * 0.07 * floatArc;
          ePZ = floatArc * 0.11;
          eRX = (1 - ease) * (row - (TILE_ROWS - 1) / 2) * 0.085
            + Math.sin(wallEntranceElapsed * 1.25 + i * 0.37) * 0.06 * floatArc;
          eRY = (1 - ease) * (col - (TILE_COLS - 1) / 2) * 0.085
            + Math.cos(wallEntranceElapsed * 1.18 + i * 0.29) * 0.055 * floatArc;
          eRZ = (1 - ease) * ((i % 3 - 1) * 0.04)
            + Math.sin(wallEntranceElapsed * 1.5 + i * 0.43) * 0.035 * floatArc;
        }

        mesh.position.set(ePX + radialX * wave * damp * 0.24 + tremor * 0.075, ePY - radialY * wave * damp * 0.24 + tremor * 0.012, ePZ + wave * damp * 0.14 + hover * 0.04);
        mesh.scale.set(tileWidth, tileHeight, 1);
        mesh.material.opacity = 1;
        mesh.material.transparent =
          !wallEntranceComplete || mesh.material.transparent;
        mesh.rotation.x = THREE.MathUtils.damp(
          mesh.rotation.x,
          eRX + hRX,
          18,
          delta,
        );
        mesh.rotation.y = THREE.MathUtils.damp(
          mesh.rotation.y,
          eRY + hRY,
          18,
          delta,
        );
        mesh.rotation.z = THREE.MathUtils.damp(
          mesh.rotation.z,
          eRZ + hRZ,
          18,
          delta,
        );
      });

      // ── Inserted brand tile hover ────────────────────────────────────────

      // De platte muurversie van de merktegelheeft zijn eigen hover-kanteling.
      if (inserted) {
        const hover = hoveredWallTileIndex === CURRENT_BRAND_INDEX ? 1 : 0;
        let hRX = 0,
          hRY = 0,
          hRZ = 0;
        if (hover) {
          const relX = THREE.MathUtils.clamp(
            (hoverWorld.x - targetX) / (tileWidth / 2),
            -1,
            1,
          );
          const relY = THREE.MathUtils.clamp(
            (hoverWorld.y - targetY) / (tileHeight / 2),
            -1,
            1,
          );
          const tremble =
            Math.sin(elapsed * 28 + CURRENT_BRAND_INDEX * 0.7) * 0.04;
          hRY = relX * 0.5 + tremble;
          hRX = -relY * 0.38 + tremble * 0.75;
          hRZ = Math.sin(elapsed * 22 + CURRENT_BRAND_INDEX) * 0.018;
        }
        currentBrandWallTile.position.z = 0.05 + hover * 0.045; // licht naar voren bij hover
        currentBrandWallTile.rotation.x = THREE.MathUtils.damp(
          currentBrandWallTile.rotation.x,
          hRX,
          18,
          delta,
        );
        currentBrandWallTile.rotation.y = THREE.MathUtils.damp(
          currentBrandWallTile.rotation.y,
          hRY,
          18,
          delta,
        );
        currentBrandWallTile.rotation.z = THREE.MathUtils.damp(
          currentBrandWallTile.rotation.z,
          hRZ,
          18,
          delta,
        );
      } else {
        // Niet-ingevoegd: rotaties terugdampen naar nul.
        currentBrandWallTile.position.z = 0.05;
        currentBrandWallTile.rotation.x = THREE.MathUtils.damp(
          currentBrandWallTile.rotation.x,
          0,
          10,
          delta,
        );
        currentBrandWallTile.rotation.y = THREE.MathUtils.damp(
          currentBrandWallTile.rotation.y,
          0,
          10,
          delta,
        );
        currentBrandWallTile.rotation.z = THREE.MathUtils.damp(
          currentBrandWallTile.rotation.z,
          0,
          10,
          delta,
        );
      }

      // ── Draw ─────────────────────────────────────────────────────────────

      renderer.render(scene, camera);

      // Markeer het eerste frame als getekend en probeer onReady te sturen.
      if (!firstFrameDone) {
        firstFrameDone = true;
        notifyReady();
      }
    };

    animate();

    // ── Cleanup ───────────────────────────────────────────────────────────────

    // Wordt aangeroepen als de component unmount: stop de animatielus, verwijder
    // alle event listeners en geef alle Three.js-resources vrij.
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", layoutTiles);
      host.removeEventListener("pointerdown", handlePointerDown);
      host.removeEventListener("pointermove", handlePointerMove);
      host.removeEventListener("pointerup", handlePointerUp);
      host.removeEventListener("pointercancel", handlePointerUp);
      host.removeEventListener("pointerleave", handlePointerLeave);
      host.removeEventListener("click", handleClick);
      setRevealStageLight(false);

      renderer.dispose();
      [tileGeometry, floatingTileGeometry, overlayGeometry, particleGeometry, shockwave.geometry, idleGlow.geometry].forEach((g) => g.dispose());
      [particleMaterial, shockwaveMaterial, idleGlowMaterial, overlayMaterial, flashOverlayMaterial].forEach((m) => m.dispose());
      rotRingGroup.children.forEach((c) => { if (c.geometry) c.geometry.dispose(); }); rotMatArc.dispose(); rotMatCone.dispose();
      if (lockedPlate)  lockedPlate.material.dispose();
      if (crackOverlay) crackOverlay.material.dispose();
      revealShards.forEach((s) => { s.geometry.dispose(); s.material.dispose(); });
      revealRays.forEach((r)   => { r.geometry.dispose(); r.material.dispose(); });
      [emptyTexture, currentBrandTexture, tileBackTexture, ceramicEdgeTexture, ritualsTexture, burgerkingTexture, lockedTexture, crackTexture].forEach((t) => t.dispose());
      [emptyMaterial, blankMaterial, ritualsMaterial, burgerkingMaterial, currentBrandMaterial, tileBackMaterial, ceramicSideMaterial, lockedMaterial, revealLightMaterial, crackOverlayMaterial].forEach((m) => m.dispose());
      currentBrandWallTile.material.dispose();
      floatingMaterials.forEach((m) => m.dispose());
      if (host.contains(renderer.domElement))
        host.removeChild(renderer.domElement);
      floatingTileRef.current = null;
      cameraRef.current = null;
    };
  }, []);

  return (
    <div className="hero-scene-root">
      <div className="webgl-tile-wall">
        <div
          ref={hostRef}
          className="absolute inset-0"
          aria-label="LiveWall WebGL tiles"
        />
        <TileDownloadButton
          visible={showTileDownload}
          tileRef={floatingTileRef}
          hostRef={hostRef}
          cameraRef={cameraRef}
        />
      </div>
    </div>
  );
}
