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

// Genormaliseerde positie en afmetingen van het tegelraster binnen de achtergrondafbeelding.
// Waarden zijn fracties van de canvasbreedte/-hoogte (0 = links/boven, 1 = rechts/onder).
const WALL_VIEWPORT = {
  left: 0.2208,
  top: 0.1444,
  width: 0.5604,
  height: 0.5356 * 0.964,
};

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
 * Genereert procedureel een radiaal barst-patroon op een 2048×2048-canvas
 * en geeft die terug als een Three.js CanvasTexture.
 * De barst bestaat uit meerdere armen met zijvertakkingen, elk getekend in
 * drie lagen (hooglicht, inkt, schaduw) voor een keramische tegeluitstraling.
 */
function createCrackTexture(renderer) {
  const size = 2048;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Middelpunt van de barst (hart van de tegel).
  const center = { x: size * 0.5, y: size * 0.5 };

  // Elke seed bepaalt de hoek, lengte en breedte van één barstarm.
  const seeds = [
    { angle: -2.78, length: 0.5, width: 8 },
    { angle: -2.2, length: 0.38, width: 5 },
    { angle: -1.58, length: 0.54, width: 8 },
    { angle: -1.02, length: 0.42, width: 5 },
    { angle: -0.46, length: 0.58, width: 8 },
    { angle: 0.08, length: 0.46, width: 6 },
    { angle: 0.62, length: 0.5, width: 7 },
    { angle: 1.18, length: 0.42, width: 5 },
    { angle: 1.72, length: 0.52, width: 8 },
    { angle: 2.3, length: 0.46, width: 6 },
    { angle: 2.82, length: 0.56, width: 8 },
  ];

  /**
   * Tekent één barstsegment als drie gestapelde lijnen:
   * 1. Een breed, licht hooglicht voor diepteillusie.
   * 2. De donkerblauwe hoofdlijn.
   * 3. Een smalle donkere schaduw eronder voor reliëf.
   */
  const drawCrack = (points, width, alpha) => {
    // Hooglicht (licht, iets verschoven)
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.55})`;
    ctx.lineWidth = width * 1.65;
    ctx.beginPath();
    points.forEach((p, i) =>
      i === 0 ? ctx.moveTo(p.x + 3, p.y - 2) : ctx.lineTo(p.x + 3, p.y - 2),
    );
    ctx.stroke();

    // Hoofdlijn (donkerblauw)
    ctx.strokeStyle = `rgba(16, 53, 126, ${alpha})`;
    ctx.lineWidth = width;
    ctx.beginPath();
    points.forEach((p, i) =>
      i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y),
    );
    ctx.stroke();

    // Schaduw (donker, iets verschoven)
    ctx.strokeStyle = `rgba(3, 16, 45, ${alpha * 0.38})`;
    ctx.lineWidth = Math.max(1, width * 0.34);
    ctx.beginPath();
    points.forEach((p, i) =>
      i === 0 ? ctx.moveTo(p.x - 2, p.y + 1) : ctx.lineTo(p.x - 2, p.y + 1),
    );
    ctx.stroke();
  };

  seeds.forEach((seed, si) => {
    // Bereken de punten van de hoofdarm met lichte zigzag-variatie.
    const points = [];
    const segmentCount = 7 + (si % 4);
    for (let s = 0; s <= segmentCount; s++) {
      const t = s / segmentCount;
      const angle =
        seed.angle +
        Math.sin(s * 2.45 + si * 0.8) * 0.13 +
        Math.cos(s * 1.25 + si) * 0.06;
      const radius =
        size * seed.length * t * (0.45 + Math.sin(t * Math.PI) * 0.12);
      points.push({
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
      });
    }
    drawCrack(points, seed.width, 0.72);

    // Voeg één of twee zijvertakkingen toe aan elke arm.
    const branchCount = si % 2 === 0 ? 2 : 1;
    for (let bi = 0; bi < branchCount; bi++) {
      const root = points[Math.floor(points.length * (0.38 + bi * 0.18))];
      const bAngle =
        seed.angle + (bi % 2 === 0 ? 1 : -1) * (0.62 + Math.random() * 0.42);
      const bLen = size * seed.length * (0.12 + Math.random() * 0.1);
      const bPoints = [root];
      for (let s = 1; s <= 4; s++) {
        const t = s / 4;
        const angle = bAngle + Math.sin(s * 1.9 + si) * 0.12;
        bPoints.push({
          x: root.x + Math.cos(angle) * bLen * t,
          y: root.y + Math.sin(angle) * bLen * t,
        });
      }
      drawCrack(bPoints, Math.max(2.2, seed.width * 0.42), 0.56);
    }
  });

  return configureTexture(new THREE.CanvasTexture(canvas), renderer);
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
 */
export default function HeroScene({
  onReady,
  onFocusOverlayChange,
  onRevealLightChange,
  externalFocusOverlayVisible,
  startIntro = true,
  startWallEntrance = false,
  onStartIntroRequest,
} = {}) {
  const hostRef = useRef(null);
  const floatingTileRef = useRef(null);
  const [showTileDownload, setShowTileDownload] = useState(false);

  // Refs slaan de actuele prop-waarden op zodat de imperatieve animatielus
  // altijd de meest recente waarden ziet zonder dat het effect opnieuw hoeft te draaien.
  const startIntroRef = useRef(startIntro);
  const startWallEntranceRef = useRef(startWallEntrance);
  const externalOverlayRef = useRef(externalFocusOverlayVisible ?? true);

  useEffect(() => {
    externalOverlayRef.current = externalFocusOverlayVisible ?? true;
  }, [externalFocusOverlayVisible]);
  useEffect(() => {
    startIntroRef.current = startIntro;
  }, [startIntro]);
  useEffect(() => {
    startWallEntranceRef.current = startWallEntrance;
  }, [startWallEntrance]);

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

    // Orthografische camera: world-units komen direct overeen met de genormaliseerde viewport-rect.
    // Hierdoor is het positioneren van tegels een kwestie van simpele vermenigvuldiging.
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);

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

    // De barst-textuur wordt procedureel gegenereerd op de CPU (geen netwerk nodig).
    const crackTexture = createCrackTexture(renderer);

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
    const revealLightMaterial = new THREE.MeshBasicMaterial({
      color: "#ffe2a0",
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      side: THREE.DoubleSide,
    });

    // Barst-overlay die over de tegel getekend wordt tijdens de ontgrendeling.
    const crackOverlayMaterial = new THREE.MeshBasicMaterial({
      color: "#ffffff",
      map: crackTexture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
    });

    // ── Shared geometries ─────────────────────────────────────────────────────

    // Gedeelde geometrieën worden hergebruikt voor alle tegels om GPU-geheugen te sparen.
    const tileGeometry = new THREE.PlaneGeometry(1, 1); // platte muurtegelplane
    const floatingTileGeometry = new THREE.BoxGeometry(1, 1, TILE_DEPTH); // 3D-keramische doos
    const overlayGeometry = new THREE.PlaneGeometry(1, 1); // vignet en lichtoverlays

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
      group: tileGroup[i],
      duration: 1.4 + Math.random() * 0.5,
      edge: Math.floor(Math.random() * 4), // 0=links 1=rechts 2=boven 3=onder
      edgeT: (Math.random() - 0.5) * 1.6, // positie langs de rand
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
    floatingMaterials.forEach((m) => {
      m.transparent = true;
    });
    floatingMaterials[4].opacity = 0; // voor-vlak begint onzichtbaar (onthulling via intro)
    floatingMaterials[5].opacity = 0; // achter-vlak idem

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

    // ── 3D crack tubes ────────────────────────────────────────────────────────

    // Naast de 2D-overlay worden ook 3D-buizen getekend voor de barst.
    // Elke buis volgt een CatmullRom-curve voor een organisch barst-uiterlijk.
    const crackMaterial = new THREE.MeshBasicMaterial({
      color: "#173f8c",
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
    });
    const crackLines = [];

    const crackSeeds = [
      { angle: -2.75, length: 0.54 },
      { angle: -2.18, length: 0.38 },
      { angle: -1.62, length: 0.55 },
      { angle: -1.12, length: 0.42 },
      { angle: -0.56, length: 0.58 },
      { angle: -0.08, length: 0.46 },
      { angle: 0.48, length: 0.56 },
      { angle: 1.02, length: 0.42 },
      { angle: 1.54, length: 0.54 },
      { angle: 2.1, length: 0.46 },
      { angle: 2.64, length: 0.6 },
    ];

    /**
     * Bouwt een TubeGeometry langs `points` en registreert hem in crackLines.
     * opacityScale regelt hoe zichtbaar deze specifieke buis is ten opzichte van de rest.
     */
    const createCrackTube = (points, radius, opacityScale = 1) => {
      const mesh = new THREE.Mesh(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(points),
          24,
          radius,
          7,
          false,
        ),
        crackMaterial.clone(),
      );
      mesh.renderOrder = 9;
      mesh.userData.opacityScale = opacityScale;
      crackLines.push(mesh);
      floatingTile.add(mesh);
      return mesh;
    };

    crackSeeds.forEach((seed, si) => {
      // Bereken de punten van de arm met kleine zigzag-variatie.
      const segCount = 6 + (si % 4);
      const pts = [];
      for (let s = 0; s <= segCount; s++) {
        const t = s / segCount;
        const kink =
          Math.sin(s * 2.7 + si) * 0.08 + Math.cos(s * 1.3 + si * 0.7) * 0.035;
        const angle = seed.angle + kink;
        const r = seed.length * t * (0.9 + Math.sin(t * Math.PI) * 0.08);
        pts.push(
          new THREE.Vector3(
            Math.cos(angle) * r,
            Math.sin(angle) * r,
            TILE_DEPTH / 2 + 0.018,
          ),
        );
      }
      createCrackTube(pts, 0.0105, 1);

      // Voeg een zijvertakking toe aan elke tweede arm.
      if (si % 2 === 0) {
        const root = pts[Math.floor(pts.length * 0.48)];
        const bAngle =
          seed.angle + (si % 4 < 2 ? 1 : -1) * (0.55 + Math.random() * 0.38);
        const bLen = seed.length * (0.24 + Math.random() * 0.18);
        const bPts = [root];
        for (let s = 1; s <= 4; s++) {
          const t = s / 4;
          const kink = Math.sin(s * 1.8 + si) * 0.05;
          bPts.push(
            new THREE.Vector3(
              root.x + Math.cos(bAngle + kink) * bLen * t,
              root.y + Math.sin(bAngle + kink) * bLen * t,
              TILE_DEPTH / 2 + 0.019,
            ),
          );
        }
        createCrackTube(bPts, 0.0065, 0.78);
      }
    });

    // ── Reveal shards (keramische scherven die wegvliegen bij ontgrendeling) ──

    const revealShards = [];

    /**
     * Bouwt een platte driehoeksgeometrie van een array met {x, y} punten.
     * UV-coördinaten worden afgeleid uit de positie zodat de vergrendelingstextuur
     * correct geprojecteerd wordt.
     */
    const createShardGeometry = (pts) => {
      const geo = new THREE.BufferGeometry();
      const positions = new Float32Array(pts.flatMap((p) => [p.x, p.y, 0]));
      const uvs = new Float32Array(pts.flatMap((p) => [p.x + 0.5, p.y + 0.5]));
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
      geo.computeVertexNormals();
      return geo;
    };

    // Verdeel het tegeloppervlak in een 3×3-grid van scherven,
    // elk opgesplitst in twee driehoeken.
    const shardCols = 3;
    const shardRows = 3;
    for (let row = 0; row < shardRows; row++) {
      for (let col = 0; col < shardCols; col++) {
        const x0 = -0.5 + col / shardCols;
        const x1 = -0.5 + (col + 1) / shardCols;
        const y0 = 0.5 - row / shardRows;
        const y1 = 0.5 - (row + 1) / shardRows;
        const cx = (x0 + x1) / 2 + (Math.random() - 0.5) * 0.06;
        const cy = (y0 + y1) / 2 + (Math.random() - 0.5) * 0.06;
        const fwd = Math.random() > 0.5;
        const triangles = fwd
          ? [
              [
                { x: x0, y: y0 },
                { x: x1, y: y0 + Math.random() * 0.035 },
                { x: cx, y: cy },
              ],
              [
                { x: x1, y: y1 },
                { x: x0 + Math.random() * 0.035, y: y1 },
                { x: cx, y: cy },
              ],
            ]
          : [
              [
                { x: x0, y: y1 },
                { x: x0, y: y0 - Math.random() * 0.035 },
                { x: cx, y: cy },
              ],
              [
                { x: x1, y: y0 },
                { x: x1, y: y1 + Math.random() * 0.035 },
                { x: cx, y: cy },
              ],
            ];

        triangles.forEach((pts, ti) => {
          const shard = new THREE.Mesh(
            createShardGeometry(pts),
            lockedMaterial.clone(),
          );
          const scx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
          const scy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
          const dx = scx + (Math.random() - 0.5) * 0.34;
          const dy = scy + (Math.random() - 0.5) * 0.34;
          const len = Math.hypot(dx, dy) || 1;
          shard.position.set(0, 0, TILE_DEPTH / 2 + 0.011 + ti * 0.002);
          shard.renderOrder = 7 + ti;

          // Sla de vluchtvectoren op in userData zodat de animatielus ze kan lezen.
          shard.userData.baseX = 0;
          shard.userData.baseY = 0;
          shard.userData.centroidX = scx;
          shard.userData.centroidY = scy;
          shard.userData.breakX = (dx / len) * (1.65 + Math.random() * 1.55); // horizontale vluchtafstand
          shard.userData.breakY = (dy / len) * (1.2 + Math.random() * 1.15); // verticale vluchtafstand
          shard.userData.breakZ = 0.28 + Math.random() * 0.38; // dieptevlucht (naar voren)
          shard.userData.rotX = (Math.random() - 0.5) * 5.6; // willekeurige tuimelrotatie
          shard.userData.rotY = (Math.random() - 0.5) * 5.6;
          shard.userData.rotZ = (Math.random() - 0.5) * 5.2;
          revealShards.push(shard);
          floatingTile.add(shard);
        });
      }
    }

    // ── Reveal light rays (gouden lichtstralen bij ontgrendeling) ─────────────

    const revealRays = [];
    for (let i = 0; i < 18; i++) {
      const rLen = 2.2 + Math.random() * 1.5;
      const rW = 0.08 + Math.random() * 0.18;

      // Elke lichtstraal is een plat driehoekje dat vanuit het midden uitwaaiert.
      const rGeo = new THREE.BufferGeometry();
      rGeo.setAttribute(
        "position",
        new THREE.BufferAttribute(
          new Float32Array([
            0,
            0,
            0,
            -rW,
            rLen,
            0,
            rW,
            rLen * (0.82 + Math.random() * 0.28),
            0,
          ]),
          3,
        ),
      );
      const ray = new THREE.Mesh(rGeo, revealLightMaterial.clone());
      ray.position.set(0, 0, TILE_DEPTH / 2 + 0.009);
      ray.rotation.z = (i / 18) * Math.PI * 2 + (Math.random() - 0.5) * 0.18;
      ray.renderOrder = 5;
      ray.userData.phase = i * 0.31 + Math.random() * 0.8; // faseverschuiving voor organisch pulseren
      ray.userData.baseScale = 0.6 + Math.random() * 0.8;
      revealRays.push(ray);
      floatingTile.add(ray);
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

    // Toestandsvariabelen voor de intro-sequentie.
    let introProgress = 0;
    let introActive = true;
    let introFlightStarted = false;
    let introSoundPlayed = false;
    let revealStageLightVisible = false;

    // Toestandsvariabelen voor de muur-ingangsanimatie.
    let wallEntranceActive = false;
    let wallEntranceComplete = false;
    let wallEntranceStartedAt = 0;
    let glowStartTime = -1;
    let overlayOpacity = FOCUS_OVERLAY_OPACITY;

    const flightDuration = 3.15; // seconden voor de invoegvlucht
    const introDelay = 5; // seconden wachten voor de intro-animatie start
    const introAnimationDuration = 7.1; // seconden voor de volledige intro-animatie
    const introDuration = introDelay + introAnimationDuration;

    // Pointer/drag-tracking.
    const pointer = { x: 0, y: 0, overTile: false };
    const hoverWorld = { x: 0, y: 0 };
    const targetRotation = { x: 0, y: 0 };
    const dragState = {
      active: false,
      moved: false,
      lastX: 0,
      lastY: 0,
      rotationX: 0,
      rotationY: 0,
    };
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

      tiles.forEach((mesh, i) => {
        const col = i % TILE_COLS;
        const row = Math.floor(i / TILE_COLS);

        // World-ruimtepositie van het middelpunt van deze tegel.
        const x = wallLeft + tileWidth * (col + 0.5);
        const y = wallTop - tileHeight * (row + 0.5);

        mesh.userData.baseX = x;
        mesh.userData.baseY = y;
        mesh.userData.entranceDelay = 0.15 + tileRng[i].group * 0.28;
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
          floatingTile.userData.entranceDelay =
            currentBrandWallTile.userData.entranceDelay ?? 0.2;
          floatingTile.userData.entranceDuration =
            currentBrandWallTile.userData.entranceDuration ?? 1.05;
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
        host.style.cursor =
          !startIntroRef.current && isInsideFloatingTile(world)
            ? "pointer"
            : "default";
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
        if (Math.abs(dx) + Math.abs(dy) > 1) dragState.moved = true;
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
      const world = clientToWorld(e);

      if (introActive) {
        // Gebruiker klikt de zwevende tegel aan om de ontgrendelsequentie te starten.
        if (!startIntroRef.current && isInsideFloatingTile(world)) {
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
        window.setTimeout(() => onFocusOverlayChange?.(true), 260);
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

      const wallEntranceElapsed =
        wallEntranceActive || wallEntranceComplete
          ? elapsed - wallEntranceStartedAt
          : -1;
      if (wallEntranceActive && wallEntranceElapsed > 7.0) {
        wallEntranceActive = false;
        wallEntranceComplete = true;
        layoutTiles();
        host.style.cursor = introActive ? "default" : "pointer";
      }

      // ── Idle glow (ademende halo terwijl er gewacht wordt op klik) ────────

      if (
        introActive &&
        !startIntroRef.current &&
        floatingTile.visible &&
        wallEntranceComplete
      ) {
        if (glowStartTime < 0) glowStartTime = elapsed;
        const fadeIn = THREE.MathUtils.clamp(
          (elapsed - glowStartTime) / 1.0,
          0,
          1,
        );
        const breathe = (Math.sin(elapsed * 1.1 - Math.PI / 2) + 1) / 2; // sinus → [0, 1]
        idleGlowMaterial.opacity = fadeIn * (0.25 + breathe * 0.6);
        idleGlow.scale.setScalar(3.0 + breathe * 2.5);
        revealRays.forEach((r) => {
          r.visible = false;
        });
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
        floatingTile.position.set(
          targetX,
          THREE.MathUtils.lerp(flyFromY, targetY, ease),
          0.07,
        );
        floatingTile.rotation.set(
          (1 - ease) * -0.18,
          (1 - ease) * 0.12,
          (1 - ease) * 0.04,
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
        revealRays.forEach((r) => {
          r.visible = false;
          r.material.opacity = 0;
        });

        introProgress = Math.min(introDuration, introProgress + delta);
        const introT = THREE.MathUtils.clamp(
          (introProgress - introDelay) / introAnimationDuration,
          0,
          1,
        );

        // Elke fase heeft een eigen genormaliseerde tijdwaarde (clamp naar [0, 1]).
        const approachT = THREE.MathUtils.clamp(introT / 0.3, 0, 1); // tegel vliegt naar voren
        const approachEase = easeInOutCubic(approachT);
        const crackT = THREE.MathUtils.clamp((introT - 0.3) / 0.44, 0, 1); // barst groeit
        const breakT = THREE.MathUtils.clamp((introT - 0.7) / 0.26, 0, 1); // scherven schieten weg
        const revealT = THREE.MathUtils.clamp((introT - 0.68) / 0.12, 0, 1); // merkafbeelding verschijnt
        const fadeOutT = THREE.MathUtils.clamp((introT - 0.68) / 0.1, 0, 1); // vergrendeling vervaagt
        const lightT = THREE.MathUtils.clamp((introT - 0.56) / 0.34, 0, 1); // lichtstralen verschijnen

        // Sla het inslaggeruidje precies op bij het moment dat de scherven wegvliegen.
        if (breakT > 0.04 && !introSoundPlayed && dropBuffer) {
          introSoundPlayed = true;
          audioContext?.resume?.();
          playDropSound(0.08);
        }

        if (approachT > 0.03 && !introFlightStarted) {
          introFlightStarted = true;
          onFocusOverlayChange?.(true); // vignet-overlay aanzetten tijdens de vlucht
        }

        setRevealStageLight(lightT > 0.08 && introT < 0.96);

        // Merkafbeelding (voor-vlak) en achterkant fade in.
        floatingMaterials[4].opacity = smootherStep(revealT);
        floatingMaterials[5].opacity = smootherStep(approachT);

        // Vergrendeling vervaagt weg.
        if (lockedPlate) {
          lockedPlate.material.opacity = 1 - smootherStep(fadeOutT);
          lockedPlate.visible = lockedPlate.material.opacity > 0.01;
        }

        // 2D barst-overlay groeit en vervaagt daarna weg.
        if (crackOverlay) {
          const ot = smootherStep(crackT);
          crackOverlay.material.opacity =
            ot *
            Math.max(
              0,
              1 -
                smootherStep(
                  THREE.MathUtils.clamp((introT - 0.74) / 0.14, 0, 1),
                ),
            );
          crackOverlay.visible = crackOverlay.material.opacity > 0.01;
          crackOverlay.scale.setScalar(0.04 + ot * 1.04);
        }

        // 3D barst-buizen groeien en verdwijnen na de breuk.
        crackLines.forEach((line, i) => {
          const lineT = THREE.MathUtils.clamp(
            (crackT - i * 0.022) / 0.72,
            0,
            1,
          );
          const lineE = smootherStep(lineT);
          line.material.opacity =
            (0.06 + Math.sin(lineT * Math.PI) * 0.12 + lineE * 0.2) *
            line.userData.opacityScale *
            Math.max(
              0,
              1 -
                smootherStep(
                  THREE.MathUtils.clamp((introT - 0.72) / 0.16, 0, 1),
                ),
            );
          line.scale.setScalar(0.03 + lineE * 1.1);
          line.visible = line.material.opacity > 0.01;
        });

        // Scherven vliegen weg met vertraging per scher naar afstand van het centrum.
        revealShards.forEach((shard, i) => {
          const localDelay =
            (i % 9) * 0.009 +
            Math.hypot(shard.userData.centroidX, shard.userData.centroidY) *
              0.04;
          const rawT = Math.max(0, breakT - localDelay);
          const shardT = THREE.MathUtils.clamp(rawT / 0.34, 0, 1);
          const shardEase = smootherStep(shardT);
          const preCrack = Math.sin(elapsed * 32 + i * 0.8) * crackT * 0.012; // kleine trilling voor de breuk
          const blast = shardEase ** 0.64 + Math.max(0, rawT - 0.09) * 2.75;
          const flutter = Math.sin(elapsed * 14 + i) * 0.026 * blast; // rondfladderende beweging
          shard.position.x =
            shard.userData.baseX +
            shard.userData.breakX * blast +
            preCrack +
            flutter;
          shard.position.y =
            shard.userData.baseY +
            shard.userData.breakY * blast -
            preCrack * 0.6 +
            flutter * 0.45;
          shard.position.z =
            TILE_DEPTH / 2 + 0.011 + shard.userData.breakZ * blast;
          shard.rotation.set(
            shard.userData.rotX * blast + flutter,
            shard.userData.rotY * blast,
            shard.userData.rotZ * blast + preCrack,
          );
          shard.material.opacity = Math.max(
            0,
            1 - smootherStep(THREE.MathUtils.clamp((introT - 0.9) / 0.1, 0, 1)),
          );
          shard.visible = shard.material.opacity > 0.01;
        });

        // Lichtstralen pulseren en draaien langzaam rond.
        revealRays.forEach((ray) => {
          const pulse =
            Math.sin(lightT * Math.PI + ray.userData.phase) * 0.5 + 0.5;
          const burst = Math.sin(lightT * Math.PI);
          ray.material.opacity =
            lightT > 0 && lightT < 1 ? (0.025 + pulse * 0.065) * burst : 0;
          ray.scale.set(
            ray.userData.baseScale * (0.12 + lightT * 0.65),
            ray.userData.baseScale * (0.32 + lightT * 0.9),
            1,
          );
          ray.rotation.z += delta * (0.05 + ray.userData.phase * 0.012);
          ray.visible = ray.material.opacity > 0.01;
        });

        // Korte schudbeweging op het moment van breuk.
        const shakePulse =
          Math.sin(Math.min(1, breakT) * Math.PI) *
          Math.max(0, 1 - THREE.MathUtils.clamp((introT - 0.82) / 0.16, 0, 1));
        revealDustPulse = Math.sin(Math.min(1, breakT) * Math.PI) * 0.42;

        floatingTile.position.set(
          THREE.MathUtils.lerp(targetX, startX, approachEase) +
            Math.sin(elapsed * 68) * 0.035 * shakePulse,
          THREE.MathUtils.lerp(targetY, startY, approachEase) +
            Math.sin(approachT * Math.PI) * tileHeight * 0.45 +
            Math.cos(elapsed * 59) * 0.025 * shakePulse,
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

        // Intro afgerond: ruim alle effectobjecten op.
        if (introProgress >= introDuration) {
          introActive = false;
          introFlightStarted = false;
          setShowTileDownload(true);
          setRevealStageLight(false);
          floatingMaterials[4].opacity = floatingMaterials[5].opacity = 1;
          if (lockedPlate) lockedPlate.visible = false;
          [...revealShards, ...revealRays, ...crackLines].forEach((obj) => {
            obj.visible = false;
            obj.material.opacity = 0;
          });
          if (crackOverlay) {
            crackOverlay.visible = false;
            crackOverlay.material.opacity = 0;
          }
          host.style.cursor = pointer.overTile ? "grab" : "pointer";
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
        }
      }

      // ── Overlay opacity ───────────────────────────────────────────────────

      // In rust: overlay langzaam terug naar de standaardopaciteit.
      if (!insertionStarted && !inserted && !extracting)
        overlayOpacity = THREE.MathUtils.damp(
          overlayOpacity,
          FOCUS_OVERLAY_OPACITY,
          5,
          delta,
        );

      // Als de tegel ingevoegd is: overlay volledig wegdampen (muur is nu vrij te bekijken).
      if (inserted)
        overlayOpacity = THREE.MathUtils.damp(overlayOpacity, 0, 5, delta);

      overlayMaterial.opacity = overlayOpacity;
      focusOverlay.visible =
        overlayOpacity > 0.003 &&
        externalOverlayRef.current &&
        wallEntranceComplete;

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
        if (introActive && (i === 4 || i === 5)) {
          mat.transparent = true;
          return;
        }
        mat.opacity = inserted
          ? Math.max(0, 1 - (elapsed - impactTime) * 3.2)
          : 1;
        mat.transparent = i === 4 || inserted;
      });

      // Snap de ingevoegde toestand als de vlucht zijn eindpunt bereikt.
      if (insertionStarted && !extracting && !inserted && progress >= 1) {
        inserted = true;
        impactTime = elapsed;
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
        let ePX = mesh.userData.baseX,
          ePY = mesh.userData.baseY,
          eRX = 0,
          eRY = 0,
          eRZ = 0;
        if (!wallEntranceComplete) {
          const localT = THREE.MathUtils.clamp(
            (wallEntranceElapsed - mesh.userData.entranceDelay) /
              mesh.userData.entranceDuration,
            0,
            1,
          );
          const ease = smootherStep(localT);
          ePX = THREE.MathUtils.lerp(
            mesh.userData.fromX ?? mesh.userData.baseX,
            mesh.userData.baseX,
            ease,
          );
          ePY = THREE.MathUtils.lerp(
            mesh.userData.fromY ?? mesh.userData.baseY,
            mesh.userData.baseY,
            ease,
          );
          eRX = (1 - ease) * (row - (TILE_ROWS - 1) / 2) * 0.06; // lichte kanteling van boven/onder
          eRY = (1 - ease) * (col - (TILE_COLS - 1) / 2) * 0.06; // lichte kanteling van links/rechts
          eRZ = (1 - ease) * (((i % 3) - 1) * 0.02); // subtiele rolvariatie
        }

        mesh.position.set(
          ePX + radialX * wave * damp * 0.24 + tremor * 0.075,
          ePY - radialY * wave * damp * 0.24 + tremor * 0.012,
          wave * damp * 0.14 + hover * 0.04,
        );
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
      [
        tileGeometry,
        floatingTileGeometry,
        overlayGeometry,
        particleGeometry,
        shockwave.geometry,
        idleGlow.geometry,
      ].forEach((g) => g.dispose());
      [
        particleMaterial,
        shockwaveMaterial,
        idleGlowMaterial,
        overlayMaterial,
      ].forEach((m) => m.dispose());
      if (lockedPlate) lockedPlate.material.dispose();
      if (crackOverlay) crackOverlay.material.dispose();
      revealShards.forEach((s) => {
        s.geometry.dispose();
        s.material.dispose();
      });
      revealRays.forEach((r) => {
        r.geometry.dispose();
        r.material.dispose();
      });
      crackLines.forEach((l) => {
        l.geometry.dispose();
        l.material.dispose();
      });
      [
        emptyTexture,
        currentBrandTexture,
        tileBackTexture,
        ceramicEdgeTexture,
        ritualsTexture,
        burgerkingTexture,
        lockedTexture,
        crackTexture,
      ].forEach((t) => t.dispose());
      [
        emptyMaterial,
        blankMaterial,
        ritualsMaterial,
        burgerkingMaterial,
        currentBrandMaterial,
        tileBackMaterial,
        ceramicSideMaterial,
        lockedMaterial,
        revealLightMaterial,
        crackOverlayMaterial,
      ].forEach((m) => m.dispose());
      currentBrandWallTile.material.dispose();
      floatingMaterials.forEach((m) => m.dispose());
      if (host.contains(renderer.domElement))
        host.removeChild(renderer.domElement);
      floatingTileRef.current = null;
    };
  }, []);

  return (
    <div className="hero-scene-root">
      <div
        ref={hostRef}
        className="webgl-tile-wall"
        aria-label="LiveWall WebGL tiles"
      />
      <TileDownloadButton
        visible={showTileDownload}
        tileRef={floatingTileRef}
      />
    </div>
  );
}
