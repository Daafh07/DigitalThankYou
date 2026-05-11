'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const TILE_COLS = 10;
const TILE_ROWS = 6;
const TILE_COUNT = TILE_COLS * TILE_ROWS;
const CURRENT_BRAND_INDEX = 24;
const EMPTY_TILE_TEXTURE = '/assets/textures/emptytile.svg';
const CURRENT_BRAND_TEXTURE = '/assets/textures/currentbrand.svg';
const RITUALS_TEXTURE = '/assets/textures/rituals.svg';
const BURGERKING_TEXTURE = '/assets/textures/burgerking.svg';
const LOCKED_TILE_TEXTURE = '/assets/textures/lockedtile.svg';
const TILE_BACK_TEXTURE = '/assets/textures/achterkantefteling.svg';
const CERAMIC_EDGE_TEXTURE = '/assets/textures/keramiek.jpg';
const DROP_SOUND = '/assets/audio/dropsound.mp3';
const FREE_TILE_SCALE = 3.75;
const FREE_TILE_Z = 3.25;
const TILE_DEPTH = 0.10;
const TILE_ART_ASPECT = 79 / 82;
const FOCUS_OVERLAY_OPACITY = 0.22;
const WALL_VIEWPORT = {
  left: 0.2208,
  top: 0.1444,
  width: 0.5604,
  height: 0.5356 * 0.964,
};
const FIXED_CLIENT_TILES = {
  [CURRENT_BRAND_INDEX - 1]: 'rituals',
  [CURRENT_BRAND_INDEX + 1]: 'burgerking',
};

function easeInOutCubic(value) {
  return value < 0.5 ? 4 * value * value * value : 1 - ((-2 * value + 2) ** 3) / 2;
}

function smootherStep(value) {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

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

function loadSvgTexture(url, renderer, version, size = 2048, onComplete) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.fillStyle = '#fff8ee';
  context.fillRect(0, 0, size, size);

  const texture = configureTexture(new THREE.CanvasTexture(canvas), renderer);
  const image = new Image();

  image.onload = () => {
    context.clearRect(0, 0, size, size);
    context.fillStyle = '#fff8ee';
    context.fillRect(0, 0, size, size);
    context.drawImage(image, 0, 0, size, size);
    texture.needsUpdate = true;
    onComplete?.();
  };

  image.onerror = () => {
    onComplete?.();
  };

  image.src = `${url}?v=${version}`;
  return texture;
}

function loadImageTexture(url, renderer, version, onComplete) {
  const loader = new THREE.TextureLoader();
  const texture = loader.load(
    `${url}?v=${version}`,
    () => {
      configureTexture(texture, renderer);
      onComplete?.();
    },
    undefined,
    () => {
      onComplete?.();
    },
  );

  return configureTexture(texture, renderer);
}

function createCrackTexture(renderer) {
  const size = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, size, size);
  context.lineCap = 'round';
  context.lineJoin = 'round';

  const center = { x: size * 0.5, y: size * 0.5 };
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

  const drawCrack = (points, width, alpha) => {
    context.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.55})`;
    context.lineWidth = width * 1.65;
    context.beginPath();
    points.forEach((point, index) => {
      if (index === 0) context.moveTo(point.x + 3, point.y - 2);
      else context.lineTo(point.x + 3, point.y - 2);
    });
    context.stroke();

    context.strokeStyle = `rgba(16, 53, 126, ${alpha})`;
    context.lineWidth = width;
    context.beginPath();
    points.forEach((point, index) => {
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
    context.stroke();

    context.strokeStyle = `rgba(3, 16, 45, ${alpha * 0.38})`;
    context.lineWidth = Math.max(1, width * 0.34);
    context.beginPath();
    points.forEach((point, index) => {
      if (index === 0) context.moveTo(point.x - 2, point.y + 1);
      else context.lineTo(point.x - 2, point.y + 1);
    });
    context.stroke();
  };

  seeds.forEach((seed, index) => {
    const points = [];
    const segmentCount = 7 + (index % 4);
    for (let step = 0; step <= segmentCount; step += 1) {
      const amount = step / segmentCount;
      const angle = seed.angle
        + Math.sin(step * 2.45 + index * 0.8) * 0.13
        + Math.cos(step * 1.25 + index) * 0.06;
      const radius = size * seed.length * amount * (0.45 + Math.sin(amount * Math.PI) * 0.12);
      points.push({
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
      });
    }
    drawCrack(points, seed.width, 0.72);

    const branchCount = index % 2 === 0 ? 2 : 1;
    for (let branchIndex = 0; branchIndex < branchCount; branchIndex += 1) {
      const branchRoot = points[Math.floor(points.length * (0.38 + branchIndex * 0.18))];
      const branchDirection = seed.angle + (branchIndex % 2 === 0 ? 1 : -1) * (0.62 + Math.random() * 0.42);
      const branchPoints = [branchRoot];
      const branchLength = size * seed.length * (0.12 + Math.random() * 0.1);
      for (let step = 1; step <= 4; step += 1) {
        const amount = step / 4;
        const angle = branchDirection + Math.sin(step * 1.9 + index) * 0.12;
        branchPoints.push({
          x: branchRoot.x + Math.cos(angle) * branchLength * amount,
          y: branchRoot.y + Math.sin(angle) * branchLength * amount,
        });
      }
      drawCrack(branchPoints, Math.max(2.2, seed.width * 0.42), 0.56);
    }
  });

  const texture = new THREE.CanvasTexture(canvas);
  return configureTexture(texture, renderer);
}

export default function HeroScene({ onReady, onFocusOverlayChange, onRevealLightChange, externalFocusOverlayVisible } = {}) {
  const hostRef = useRef(null);

  // allow parent to force the overlay off (used when entering the building)
  const externalOverlayRef = useRef(externalFocusOverlayVisible ?? true);
  useEffect(() => {
    externalOverlayRef.current = externalFocusOverlayVisible ?? true;
  }, [externalFocusOverlayVisible]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    const scene = new THREE.Scene();
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setClearColor('#000000', 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    host.appendChild(renderer.domElement);

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);

    let loadedTextures = 0;
    let buildingModel = null;
    let firstFrameRendered = false;
    let readyNotified = false;
    const notifyReady = () => {
      if (readyNotified || loadedTextures < 4 || !firstFrameRendered) return;
      readyNotified = true;
      onReady?.();
    };
    const markTextureLoaded = () => {
      loadedTextures += 1;
      notifyReady();
    };

    const textureVersion = Date.now();
    const emptyTexture = loadSvgTexture(EMPTY_TILE_TEXTURE, renderer, textureVersion, 2048, markTextureLoaded);
    const currentBrandTexture = loadSvgTexture(CURRENT_BRAND_TEXTURE, renderer, textureVersion, 2048, markTextureLoaded);
    const tileBackTexture = loadSvgTexture(TILE_BACK_TEXTURE, renderer, textureVersion, 2048, markTextureLoaded);
    const ceramicEdgeTexture = loadImageTexture(CERAMIC_EDGE_TEXTURE, renderer, textureVersion, markTextureLoaded);
    const ritualsTexture = loadSvgTexture(RITUALS_TEXTURE, renderer, textureVersion, 2048);
    const burgerkingTexture = loadSvgTexture(BURGERKING_TEXTURE, renderer, textureVersion, 2048);
    const lockedTexture = loadSvgTexture(LOCKED_TILE_TEXTURE, renderer, textureVersion, 2048);
    const crackTexture = createCrackTexture(renderer);

    const emptyMaterial = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      map: emptyTexture,
      toneMapped: false,
    });
    const blankMaterial = new THREE.MeshBasicMaterial({
      color: '#fffdf8',
      toneMapped: false,
    });
    const ritualsMaterial = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      map: ritualsTexture,
      toneMapped: false,
    });
    const burgerkingMaterial = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      map: burgerkingTexture,
      toneMapped: false,
    });
    const currentBrandMaterial = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      map: currentBrandTexture,
      toneMapped: false,
      transparent: true,
      opacity: 1,
    });
    const tileBackMaterial = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      map: tileBackTexture,
      toneMapped: false,
      transparent: true,
      opacity: 1,
    });
    const ceramicSideMaterial = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      map: ceramicEdgeTexture,
      toneMapped: false,
    });
    const lockedMaterial = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      map: lockedTexture,
      toneMapped: false,
      transparent: true,
      opacity: 1,
      depthWrite: false,
    });
    const revealLightMaterial = new THREE.MeshBasicMaterial({
      color: '#ffe2a0',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    const crackOverlayMaterial = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      map: crackTexture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
    });

    const wallGroup = new THREE.Group();
    scene.add(wallGroup);

    const tiles = [];
    const tileGeometry = new THREE.PlaneGeometry(1, 1);
    const floatingTileGeometry = new THREE.BoxGeometry(1, 1, TILE_DEPTH);
    const overlayGeometry = new THREE.PlaneGeometry(1, 1);
    const overlayMaterial = new THREE.MeshBasicMaterial({
      color: '#071326',
      transparent: true,
      opacity: FOCUS_OVERLAY_OPACITY,
      depthWrite: false,
      toneMapped: false,
    });
    const focusOverlay = new THREE.Mesh(overlayGeometry, overlayMaterial);
    focusOverlay.position.z = 0.82;
    focusOverlay.renderOrder = 2;
    scene.add(focusOverlay);

    const particleCount = 260;
    const particlePositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = (Math.random() ** 1.8) * 2.8;
      particlePositions[i * 3] = Math.cos(angle) * radius;
      particlePositions[i * 3 + 1] = Math.sin(angle) * radius * 0.72;
      particlePositions[i * 3 + 2] = 0.22 + Math.random() * 0.74;
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particleMaterial = new THREE.PointsMaterial({
      color: '#dfc179',
      size: 0.015,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    particles.renderOrder = 4;
    scene.add(particles);

    // Load optional building GLB model (place your model at /public/assets/models/buildings/Livewall-gebouw.glb)
    try {
      const gltfLoader = new GLTFLoader();
      gltfLoader.load(
        '/assets/models/buildings/Livewall-gebouw.glb',
        (gltf) => {
          buildingModel = gltf.scene;
          buildingModel.traverse((node) => {
            if (node.isMesh) {
              node.castShadow = false;
              node.receiveShadow = false;
              node.frustumCulled = false;
            }
          });
          // Adjust scale/position to taste — these are sensible defaults for the orthographic camera
          buildingModel.scale.set(1.0, 1.0, 1.0);
          buildingModel.position.set(0, -1.05, -1.0);
          scene.add(buildingModel);
        },
        undefined,
        () => {
          // silently ignore load errors — model is optional
        },
      );
    } catch (e) {
      // loader not available or failed — continue without model
    }

    const shockwaveMaterial = new THREE.MeshBasicMaterial({
      color: '#d1a14a',
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const shockwave = new THREE.Mesh(new THREE.TorusGeometry(1, 0.01, 8, 72), shockwaveMaterial);
    shockwave.position.z = 0.22;
    shockwave.renderOrder = 4;
    scene.add(shockwave);

    let viewWidth = 10;
    let viewHeight = 6;
    let tileWidth = 1;
    let tileHeight = 1;
    let wallLeft = -5;
    let wallTop = 3;
    let wallWidth = 10;
    let wallHeight = 6;
    let freeTileWidth = 1;
    let freeTileHeight = 1;
    let currentBrandWallTile = null;
    let floatingTile = null;
    let lockedPlate = null;
    let crackOverlay = null;
    const revealShards = [];
    const revealRays = [];
    const crackLines = [];
    let targetX = 0;
    let targetY = 0;
    let startX = 0;
    let startY = 0;
    let frameId = 0;
    let progress = 0;
    let insertionStarted = false;
    let insertionFlightReleased = false;
    let inserted = false;
    let extracting = false;
    let extractProgress = 0;
    let impactTime = null;
    let introProgress = 0;
    let introActive = true;
    let introFlightStarted = false;
    let introSoundPlayed = false;
    let revealStageLightVisible = false;
    let overlayOpacity = FOCUS_OVERLAY_OPACITY;
    let audioContext = null;
    let dropBuffer = null;
    let audioLoading = false;
    const droppedTileSounds = new Set();
    const flightDuration = 3.15;
    const introDelay = 5;
    const introAnimationDuration = 7.1;
    const introDuration = introDelay + introAnimationDuration;
    const pointer = { x: 0, y: 0, overTile: false };
    let hoveredWallTileIndex = -1;
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
    const clock = new THREE.Clock();
    onFocusOverlayChange?.(true);

    const ensureDropSound = () => {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext || audioLoading || dropBuffer) return;

      audioLoading = true;
      audioContext = audioContext || new AudioContext();
      fetch(DROP_SOUND)
        .then((response) => response.arrayBuffer())
        .then((buffer) => audioContext.decodeAudioData(buffer))
        .then((decodedBuffer) => {
          dropBuffer = decodedBuffer;
        })
        .catch(() => {
          dropBuffer = null;
        })
        .finally(() => {
          audioLoading = false;
        });
    };

    const playDropSound = (volume = 0.045) => {
      if (!dropBuffer || !audioContext) return;

      const source = audioContext.createBufferSource();
      const gain = audioContext.createGain();
      source.buffer = dropBuffer;
      gain.gain.value = volume;
      source.connect(gain).connect(audioContext.destination);
      source.start();
    };

    const setRevealStageLight = (visible) => {
      if (revealStageLightVisible === visible) return;
      revealStageLightVisible = visible;
      onRevealLightChange?.(visible);
    };

    ensureDropSound();

    for (let index = 0; index < TILE_COUNT; index += 1) {
      let material = emptyMaterial;
      if (index === CURRENT_BRAND_INDEX) material = blankMaterial;
      if (index === CURRENT_BRAND_INDEX - 1) material = ritualsMaterial;
      if (index === CURRENT_BRAND_INDEX + 1) material = burgerkingMaterial;
      const mesh = new THREE.Mesh(tileGeometry, material);
      wallGroup.add(mesh);
      tiles.push(mesh);
    }

    currentBrandWallTile = new THREE.Mesh(tileGeometry, currentBrandMaterial.clone());
    currentBrandWallTile.material.opacity = 0;
    currentBrandWallTile.position.z = 0.05;
    wallGroup.add(currentBrandWallTile);

    const floatingMaterials = [
      ceramicSideMaterial.clone(),
      ceramicSideMaterial.clone(),
      ceramicSideMaterial.clone(),
      ceramicSideMaterial.clone(),
      currentBrandMaterial.clone(),
      tileBackMaterial.clone(),
    ];
    floatingMaterials.forEach((material) => {
      material.transparent = true;
    });
    floatingMaterials[4].opacity = 0;
    floatingMaterials[5].opacity = 0;
    floatingTile = new THREE.Mesh(floatingTileGeometry, floatingMaterials);
    floatingTile.position.z = 0.07;
    floatingTile.renderOrder = 3;
    scene.add(floatingTile);

    lockedPlate = new THREE.Mesh(tileGeometry, lockedMaterial.clone());
    lockedPlate.position.z = TILE_DEPTH / 2 + 0.008;
    lockedPlate.renderOrder = 6;
    floatingTile.add(lockedPlate);

    crackOverlay = new THREE.Mesh(tileGeometry, crackOverlayMaterial.clone());
    crackOverlay.position.z = TILE_DEPTH / 2 + 0.026;
    crackOverlay.renderOrder = 10;
    crackOverlay.visible = false;
    floatingTile.add(crackOverlay);

    const crackMaterial = new THREE.MeshBasicMaterial({
      color: '#173f8c',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
    });

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

    const createCrackTube = (points, radius, opacityScale = 1) => {
      const curve = new THREE.CatmullRomCurve3(points);
      const line = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, radius, 7, false), crackMaterial.clone());
      line.renderOrder = 9;
      line.userData.opacityScale = opacityScale;
      crackLines.push(line);
      floatingTile.add(line);
      return line;
    };

    crackSeeds.forEach((seed, index) => {
      const points = [];
      const segmentCount = 6 + (index % 4);
      for (let step = 0; step <= segmentCount; step += 1) {
        const amount = step / segmentCount;
        const kink = Math.sin(step * 2.7 + index) * 0.08 + Math.cos(step * 1.3 + index * 0.7) * 0.035;
        const angle = seed.angle + kink;
        const radius = seed.length * amount * (0.9 + Math.sin(amount * Math.PI) * 0.08);
        points.push(new THREE.Vector3(
          Math.cos(angle) * radius,
          Math.sin(angle) * radius,
          TILE_DEPTH / 2 + 0.018,
        ));
      }
      createCrackTube(points, 0.0105, 1);

      if (index % 2 === 0) {
        const branchStart = points[Math.floor(points.length * 0.48)];
        const branchAngle = seed.angle + (index % 4 < 2 ? 1 : -1) * (0.55 + Math.random() * 0.38);
        const branchLength = seed.length * (0.24 + Math.random() * 0.18);
        const branchPoints = [branchStart];
        for (let step = 1; step <= 4; step += 1) {
          const amount = step / 4;
          const kink = Math.sin(step * 1.8 + index) * 0.05;
          branchPoints.push(new THREE.Vector3(
            branchStart.x + Math.cos(branchAngle + kink) * branchLength * amount,
            branchStart.y + Math.sin(branchAngle + kink) * branchLength * amount,
            TILE_DEPTH / 2 + 0.019,
          ));
        }
        createCrackTube(branchPoints, 0.0065, 0.78);
      }
    });

    const createShardGeometry = (points) => {
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(points.flatMap((point) => [point.x, point.y, 0]));
      const uvs = new Float32Array(points.flatMap((point) => [point.x + 0.5, point.y + 0.5]));
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      geometry.computeVertexNormals();
      return geometry;
    };

    const shardCols = 3;
    const shardRows = 3;
    for (let row = 0; row < shardRows; row += 1) {
      for (let col = 0; col < shardCols; col += 1) {
        const x0 = -0.5 + col / shardCols;
        const x1 = -0.5 + (col + 1) / shardCols;
        const y0 = 0.5 - row / shardRows;
        const y1 = 0.5 - (row + 1) / shardRows;
        const centerX = (x0 + x1) / 2 + (Math.random() - 0.5) * 0.06;
        const centerY = (y0 + y1) / 2 + (Math.random() - 0.5) * 0.06;
        const splitForward = Math.random() > 0.5;
        const triangles = splitForward
          ? [
            [{ x: x0, y: y0 }, { x: x1, y: y0 + Math.random() * 0.035 }, { x: centerX, y: centerY }],
            [{ x: x1, y: y1 }, { x: x0 + Math.random() * 0.035, y: y1 }, { x: centerX, y: centerY }],
          ]
          : [
            [{ x: x0, y: y1 }, { x: x0, y: y0 - Math.random() * 0.035 }, { x: centerX, y: centerY }],
            [{ x: x1, y: y0 }, { x: x1, y: y1 + Math.random() * 0.035 }, { x: centerX, y: centerY }],
          ];

        triangles.forEach((points, triangleIndex) => {
          const material = lockedMaterial.clone();
          const shard = new THREE.Mesh(createShardGeometry(points), material);
          const cx = points.reduce((sum, point) => sum + point.x, 0) / points.length;
          const cy = points.reduce((sum, point) => sum + point.y, 0) / points.length;
          const dx = cx + (Math.random() - 0.5) * 0.34;
          const dy = cy + (Math.random() - 0.5) * 0.34;
          const length = Math.hypot(dx, dy) || 1;
          shard.position.set(0, 0, TILE_DEPTH / 2 + 0.011 + triangleIndex * 0.002);
          shard.renderOrder = 7 + triangleIndex;
          shard.userData.baseX = 0;
          shard.userData.baseY = 0;
          shard.userData.centroidX = cx;
          shard.userData.centroidY = cy;
          shard.userData.breakX = (dx / length) * (1.65 + Math.random() * 1.55);
          shard.userData.breakY = (dy / length) * (1.2 + Math.random() * 1.15);
          shard.userData.breakZ = 0.28 + Math.random() * 0.38;
          shard.userData.rotX = (Math.random() - 0.5) * 5.6;
          shard.userData.rotY = (Math.random() - 0.5) * 5.6;
          shard.userData.rotZ = (Math.random() - 0.5) * 5.2;
          revealShards.push(shard);
          floatingTile.add(shard);
        });
      }
    }

    for (let index = 0; index < 18; index += 1) {
      const rayLength = 2.2 + Math.random() * 1.5;
      const rayWidth = 0.08 + Math.random() * 0.18;
      const rayGeometry = new THREE.BufferGeometry();
      rayGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
        0, 0, 0,
        -rayWidth, rayLength, 0,
        rayWidth, rayLength * (0.82 + Math.random() * 0.28), 0,
      ]), 3));
      const ray = new THREE.Mesh(rayGeometry, revealLightMaterial.clone());
      ray.position.set(0, 0, TILE_DEPTH / 2 + 0.009);
      ray.rotation.z = (index / 18) * Math.PI * 2 + (Math.random() - 0.5) * 0.18;
      ray.renderOrder = 5;
      ray.userData.phase = index * 0.31 + Math.random() * 0.8;
      ray.userData.baseScale = 0.6 + Math.random() * 0.8;
      revealRays.push(ray);
      floatingTile.add(ray);
    }

    const layoutTiles = () => {
      const width = host.clientWidth || 1;
      const height = host.clientHeight || 1;
      const aspect = width / height;

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
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      focusOverlay.scale.set(viewWidth, viewHeight, 1);

      tiles.forEach((mesh, index) => {
        const col = index % TILE_COLS;
        const row = Math.floor(index / TILE_COLS);
        const x = wallLeft + tileWidth * (col + 0.5);
        const y = wallTop - tileHeight * (row + 0.5);

        mesh.userData.baseX = x;
        mesh.userData.baseY = y;
        mesh.position.set(x, y, 0);
        mesh.scale.set(tileWidth, tileHeight, 1);

        if (index === CURRENT_BRAND_INDEX) {
          targetX = x;
          targetY = y;
          currentBrandWallTile.position.set(x, y, 0.05);
          currentBrandWallTile.scale.set(tileWidth, tileHeight, 1);
        }
      });

      startX = 0;
      const freeTileBaseSize = Math.min(tileWidth / TILE_ART_ASPECT, tileHeight);
      freeTileWidth = freeTileBaseSize * TILE_ART_ASPECT;
      freeTileHeight = freeTileBaseSize;
      startY = viewHeight * 0.1;
      if (!inserted && floatingTile) {
        if (introActive) {
          floatingTile.position.set(targetX, targetY, 0.07);
          floatingTile.scale.set(tileWidth, tileHeight, 1);
        } else {
          floatingTile.position.set(startX, startY, FREE_TILE_Z);
          floatingTile.scale.set(freeTileWidth * FREE_TILE_SCALE, freeTileHeight * FREE_TILE_SCALE, 1);
        }
      }
    };

    layoutTiles();
    window.addEventListener('resize', layoutTiles);

    const clientToWorld = (event) => {
      const rect = host.getBoundingClientRect();
      const normalizedX = (event.clientX - rect.left) / rect.width;
      const normalizedY = (event.clientY - rect.top) / rect.height;

      return {
        x: -viewWidth / 2 + normalizedX * viewWidth,
        y: viewHeight / 2 - normalizedY * viewHeight,
      };
    };

    const isInsideFloatingTile = (world) => {
      const halfWidth = (floatingTile.scale.x || tileWidth) / 2;
      const halfHeight = (floatingTile.scale.y || tileHeight) / 2;

      return (
        Math.abs(world.x - floatingTile.position.x) <= halfWidth
        && Math.abs(world.y - floatingTile.position.y) <= halfHeight
      );
    };

    const getWallTileIndex = (world) => {
      const col = Math.floor((world.x - wallLeft) / tileWidth);
      const row = Math.floor((wallTop - world.y) / tileHeight);

      if (col < 0 || col >= TILE_COLS || row < 0 || row >= TILE_ROWS) return -1;
      return row * TILE_COLS + col;
    };

    const handlePointerMove = (event) => {
      const world = clientToWorld(event);

      if (inserted) {
        hoverWorld.x = world.x;
        hoverWorld.y = world.y;
        hoveredWallTileIndex = getWallTileIndex(world);
        host.style.cursor = hoveredWallTileIndex === CURRENT_BRAND_INDEX ? 'pointer' : 'default';
        return;
      }

      if (introActive) {
        host.style.cursor = 'default';
        return;
      }

      if (insertionStarted || extracting) return;

      pointer.x = world.x;
      pointer.y = world.y;
      pointer.overTile = isInsideFloatingTile(world);

      if (dragState.active) {
        const dx = event.clientX - dragState.lastX;
        const dy = event.clientY - dragState.lastY;
        dragState.lastX = event.clientX;
        dragState.lastY = event.clientY;

        if (Math.abs(dx) + Math.abs(dy) > 1) dragState.moved = true;

        dragState.rotationY += dx * 0.012;
        dragState.rotationX += dy * 0.01;
        targetRotation.x = dragState.rotationX;
        targetRotation.y = dragState.rotationY;
        host.style.cursor = 'grabbing';
        return;
      }

      if (pointer.overTile) {
        const relX = THREE.MathUtils.clamp((world.x - floatingTile.position.x) / (floatingTile.scale.x / 2), -1, 1);
        const relY = THREE.MathUtils.clamp((world.y - floatingTile.position.y) / (floatingTile.scale.y / 2), -1, 1);
        targetRotation.y = dragState.rotationY + relX * 0.12;
        targetRotation.x = dragState.rotationX - relY * 0.08;
        host.style.cursor = 'grab';
      } else {
        targetRotation.x = dragState.rotationX;
        targetRotation.y = dragState.rotationY;
        host.style.cursor = 'pointer';
      }
    };

    const handlePointerDown = (event) => {
      if (introActive || insertionStarted || inserted || extracting) return;

      const world = clientToWorld(event);
      if (!isInsideFloatingTile(world)) return;

      dragState.active = true;
      dragState.moved = false;
      dragState.lastX = event.clientX;
      dragState.lastY = event.clientY;
      host.setPointerCapture?.(event.pointerId);
      host.style.cursor = 'grabbing';
    };

    const handlePointerUp = (event) => {
      if (!dragState.active) return;

      dragState.active = false;
      dragState.rotationX = floatingTile.rotation.x;
      dragState.rotationY = floatingTile.rotation.y;
      host.releasePointerCapture?.(event.pointerId);
      host.style.cursor = pointer.overTile ? 'grab' : 'pointer';
    };

    const handlePointerLeave = () => {
      if (dragState.active) return;
      hoveredWallTileIndex = -1;
      pointer.overTile = false;
      targetRotation.x = dragState.rotationX;
      targetRotation.y = dragState.rotationY;
      host.style.cursor = 'default';
    };

    const handleClick = (event) => {
      if (introActive || extracting) return;

      const world = clientToWorld(event);

      if (inserted) {
        if (getWallTileIndex(world) !== CURRENT_BRAND_INDEX) return;

        extracting = true;
        window.setTimeout(() => onFocusOverlayChange?.(true), 260);
        inserted = false;
        insertionStarted = false;
        insertionFlightReleased = false;
        extractProgress = 0;
        progress = 1;
        impactTime = null;
        hoveredWallTileIndex = -1;
        currentBrandWallTile.material.opacity = 0;
        floatingMaterials.forEach((material) => {
          material.opacity = 1;
        });
        targetRotation.x = 0;
        targetRotation.y = 0;
        dragState.rotationX = 0;
        dragState.rotationY = 0;
        host.style.cursor = 'grab';
        return;
      }

      if (insertionStarted) return;
      if (dragState.moved) {
        dragState.moved = false;
        return;
      }

      if (isInsideFloatingTile(world)) return;

      insertionStarted = true;
      onFocusOverlayChange?.(false);
      insertionFlightReleased = false;
      progress = 0;
      ensureDropSound();
      audioContext?.resume?.();
      clock.getDelta();
      targetRotation.x = 0;
      targetRotation.y = 0;
      host.style.cursor = 'default';
    };

    host.addEventListener('pointerdown', handlePointerDown);
    host.addEventListener('pointermove', handlePointerMove);
    host.addEventListener('pointerup', handlePointerUp);
    host.addEventListener('pointercancel', handlePointerUp);
    host.addEventListener('pointerleave', handlePointerLeave);
    host.addEventListener('click', handleClick);

    const animate = () => {
      frameId = window.requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), 0.04);
      const elapsed = clock.elapsedTime;
      let revealDustPulse = 0;

      if (introActive) {
        introProgress = Math.min(introDuration, introProgress + delta);
        const introT = THREE.MathUtils.clamp((introProgress - introDelay) / introAnimationDuration, 0, 1);
        const approachT = THREE.MathUtils.clamp(introT / 0.3, 0, 1);
        const approachEase = easeInOutCubic(approachT);
        const crackT = THREE.MathUtils.clamp((introT - 0.3) / 0.44, 0, 1);
        const breakT = THREE.MathUtils.clamp((introT - 0.7) / 0.26, 0, 1);
        const revealT = THREE.MathUtils.clamp((introT - 0.68) / 0.12, 0, 1);
        const fadeOutT = THREE.MathUtils.clamp((introT - 0.68) / 0.1, 0, 1);
        const lightT = THREE.MathUtils.clamp((introT - 0.56) / 0.34, 0, 1);

        if (breakT > 0.04 && !introSoundPlayed && dropBuffer) {
          introSoundPlayed = true;
          audioContext?.resume?.();
          playDropSound(0.08);
        }

        if (approachT > 0.03 && !introFlightStarted) {
          introFlightStarted = true;
          onFocusOverlayChange?.(true);
        }

        setRevealStageLight(lightT > 0.08 && introT < 0.96);

        floatingMaterials[4].opacity = smootherStep(revealT);
        floatingMaterials[5].opacity = smootherStep(approachT);
        if (lockedPlate) {
          lockedPlate.material.opacity = 1 - smootherStep(fadeOutT);
          lockedPlate.visible = lockedPlate.material.opacity > 0.01;
        }

        if (crackOverlay) {
          const overlayT = smootherStep(crackT);
          crackOverlay.material.opacity = overlayT * Math.max(0, 1 - smootherStep(THREE.MathUtils.clamp((introT - 0.74) / 0.14, 0, 1)));
          crackOverlay.visible = crackOverlay.material.opacity > 0.01;
          crackOverlay.scale.setScalar(0.04 + overlayT * 1.04);
        }

        crackLines.forEach((line, index) => {
          const crackDelay = index * 0.022;
          const lineT = THREE.MathUtils.clamp((crackT - crackDelay) / 0.72, 0, 1);
          const lineEase = smootherStep(lineT);
          line.material.opacity = (0.06 + Math.sin(lineT * Math.PI) * 0.12 + lineEase * 0.2) * line.userData.opacityScale;
          line.material.opacity *= Math.max(0, 1 - smootherStep(THREE.MathUtils.clamp((introT - 0.72) / 0.16, 0, 1)));
          line.scale.setScalar(0.03 + lineEase * 1.1);
          line.visible = line.material.opacity > 0.01;
        });

        revealShards.forEach((shard, index) => {
          const localDelay = ((index % 9) * 0.009) + Math.hypot(shard.userData.centroidX, shard.userData.centroidY) * 0.04;
          const rawShardT = Math.max(0, breakT - localDelay);
          const shardT = THREE.MathUtils.clamp(rawShardT / 0.34, 0, 1);
          const shardEase = smootherStep(shardT);
          const preCrack = Math.sin(elapsed * 32 + index * 0.8) * crackT * 0.012;
          const blast = (shardEase ** 0.64) + Math.max(0, rawShardT - 0.09) * 2.75;
          const flutter = Math.sin(elapsed * 14 + index) * 0.026 * blast;
          shard.position.x = shard.userData.baseX + shard.userData.breakX * blast + preCrack + flutter;
          shard.position.y = shard.userData.baseY + shard.userData.breakY * blast - preCrack * 0.6 + flutter * 0.45;
          shard.position.z = TILE_DEPTH / 2 + 0.011 + shard.userData.breakZ * blast;
          shard.rotation.x = shard.userData.rotX * blast + flutter;
          shard.rotation.y = shard.userData.rotY * blast;
          shard.rotation.z = shard.userData.rotZ * blast + preCrack;
          shard.material.opacity = Math.max(0, 1 - smootherStep(THREE.MathUtils.clamp((introT - 0.9) / 0.1, 0, 1)));
          shard.visible = shard.material.opacity > 0.01;
        });

        revealRays.forEach((ray) => {
          const pulse = Math.sin((lightT * Math.PI) + ray.userData.phase) * 0.5 + 0.5;
          const burst = Math.sin(lightT * Math.PI);
          ray.material.opacity = lightT > 0 && lightT < 1 ? (0.025 + pulse * 0.065) * burst : 0;
          ray.scale.set(ray.userData.baseScale * (0.12 + lightT * 0.65), ray.userData.baseScale * (0.32 + lightT * 0.9), 1);
          ray.rotation.z += delta * (0.05 + ray.userData.phase * 0.012);
          ray.visible = ray.material.opacity > 0.01;
        });

        const shakePulse = Math.sin(Math.min(1, breakT) * Math.PI) * Math.max(0, 1 - THREE.MathUtils.clamp((introT - 0.82) / 0.16, 0, 1));
        const shakeX = Math.sin(elapsed * 68) * 0.035 * shakePulse;
        const shakeY = Math.cos(elapsed * 59) * 0.025 * shakePulse;

        revealDustPulse = Math.sin(Math.min(1, breakT) * Math.PI) * 0.42;

        floatingTile.position.x = THREE.MathUtils.lerp(targetX, startX, approachEase) + shakeX;
        floatingTile.position.y = THREE.MathUtils.lerp(targetY, startY, approachEase) + Math.sin(approachT * Math.PI) * tileHeight * 0.45 + shakeY;
        floatingTile.position.z = THREE.MathUtils.lerp(0.07, FREE_TILE_Z, approachEase);
        floatingTile.scale.set(
          THREE.MathUtils.lerp(tileWidth, freeTileWidth * FREE_TILE_SCALE, smootherStep(approachT)),
          THREE.MathUtils.lerp(tileHeight, freeTileHeight * FREE_TILE_SCALE, smootherStep(approachT)),
          1,
        );
        floatingTile.rotation.x = 0;
        floatingTile.rotation.y = Math.sin(approachT * Math.PI) * 0.08;
        floatingTile.rotation.z = 0;

        if (introProgress >= introDuration) {
          introActive = false;
          introFlightStarted = false;
          setRevealStageLight(false);
          floatingMaterials[4].opacity = 1;
          floatingMaterials[5].opacity = 1;
          if (lockedPlate) lockedPlate.visible = false;
          revealShards.forEach((shard) => {
            shard.visible = false;
            shard.material.opacity = 0;
          });
          revealRays.forEach((ray) => {
            ray.visible = false;
            ray.material.opacity = 0;
          });
          crackLines.forEach((line) => {
            line.visible = false;
            line.material.opacity = 0;
          });
          if (crackOverlay) {
            crackOverlay.visible = false;
            crackOverlay.material.opacity = 0;
          }
          host.style.cursor = pointer.overTile ? 'grab' : 'pointer';
        }
      }

      if (insertionStarted && !inserted) {
        overlayOpacity = THREE.MathUtils.damp(overlayOpacity, 0, 7, delta);
        if (overlayOpacity < 0.015) insertionFlightReleased = true;
        if (insertionFlightReleased) {
          progress = Math.min(1, progress + delta / flightDuration);
        }
      }

      if (extracting) {
        extractProgress = Math.min(1, extractProgress + delta / 1.85);
        progress = 1 - easeInOutCubic(extractProgress);
        if (extractProgress > 0.18) {
          overlayOpacity = THREE.MathUtils.damp(overlayOpacity, FOCUS_OVERLAY_OPACITY, 2.8, delta);
        }

        if (extractProgress >= 1) {
          extracting = false;
          insertionStarted = false;
          insertionFlightReleased = false;
          inserted = false;
          progress = 0;
          targetRotation.x = 0;
          targetRotation.y = 0;
          dragState.rotationX = 0;
          dragState.rotationY = 0;
          droppedTileSounds.clear();
        }
      }

      if (!insertionStarted && !inserted && !extracting) {
        overlayOpacity = THREE.MathUtils.damp(overlayOpacity, FOCUS_OVERLAY_OPACITY, 5, delta);
      }

      if (inserted) {
        overlayOpacity = THREE.MathUtils.damp(overlayOpacity, 0, 5, delta);
      }

      overlayMaterial.opacity = overlayOpacity;
      // respect parent-controlled overlay flag so the building entry can't leave a lingering layer
      focusOverlay.visible = overlayOpacity > 0.003 && externalOverlayRef.current;

      const eased = easeInOutCubic(progress);
      const settle = smootherStep(progress);
      const arc = Math.sin(progress * Math.PI);
      const drift = insertionStarted && !extracting ? Math.sin(elapsed * 1.35) * (1 - settle) * 0.035 : 0;

      if (!introActive) {
        floatingTile.position.x = THREE.MathUtils.lerp(startX, targetX, eased) + drift;
        floatingTile.position.y = THREE.MathUtils.lerp(startY, targetY, eased) + arc * tileHeight * 0.52;
        floatingTile.position.z = THREE.MathUtils.lerp(FREE_TILE_Z, 0.07, eased);
        floatingTile.rotation.x = THREE.MathUtils.damp(floatingTile.rotation.x, insertionStarted || extracting ? 0 : targetRotation.x, 10, delta);
        floatingTile.rotation.y = THREE.MathUtils.damp(floatingTile.rotation.y, insertionStarted || extracting ? 0 : targetRotation.y, 10, delta);
        floatingTile.rotation.z = 0;
        floatingTile.scale.set(
          THREE.MathUtils.lerp(freeTileWidth * FREE_TILE_SCALE, tileWidth, settle),
          THREE.MathUtils.lerp(freeTileHeight * FREE_TILE_SCALE, tileHeight, settle),
          1,
        );
      }
      floatingMaterials.forEach((material, index) => {
        if (introActive && index === 4) {
          material.transparent = true;
          return;
        }
        if (introActive && index === 5) {
          material.transparent = true;
          return;
        }
        material.opacity = inserted ? Math.max(0, 1 - (elapsed - impactTime) * 3.2) : 1;
        material.transparent = index === 4 || inserted;
      });

      if (insertionStarted && !extracting && !inserted && progress >= 1) {
        inserted = true;
        impactTime = elapsed;
        currentBrandWallTile.material.opacity = 1;
      }

      const impactLife = impactTime == null ? -1 : elapsed - impactTime;
      const particlePulse = impactLife > 0 ? Math.exp(-impactLife * 0.95) : revealDustPulse;
      particles.position.x = impactLife > 0 ? targetX : floatingTile.position.x;
      particles.position.y = (impactLife > 0 ? targetY : floatingTile.position.y) + Math.sin(elapsed * 0.2) * 0.025;
      particles.position.z = 0.02;
      particles.rotation.z = Math.sin(elapsed * 0.32) * 0.08 + Math.max(0, impactLife) * 0.18;
      const dustScale = impactLife > 0 ? 0.46 + Math.min(impactLife, 2.8) * 0.62 : 0.58 + revealDustPulse * 0.85;
      particles.scale.setScalar(dustScale);
      particleMaterial.opacity = particlePulse * (impactLife > 0 ? 0.58 : 0.5);
      particleMaterial.size = 0.015 + particlePulse * (impactLife > 0 ? 0.03 : 0.022);

      if (impactLife > 0 && impactLife < 3.2) {
        shockwave.position.x = targetX;
        shockwave.position.y = targetY;
        shockwave.scale.setScalar(0.14 + impactLife * 2.45);
        shockwaveMaterial.opacity = Math.max(0, 0.34 * (1 - impactLife / 3.2));
      } else {
        shockwaveMaterial.opacity = 0;
      }

      tiles.forEach((mesh, index) => {
        const col = index % TILE_COLS;
        const row = Math.floor(index / TILE_COLS);
        const centerCol = CURRENT_BRAND_INDEX % TILE_COLS;
        const centerRow = Math.floor(CURRENT_BRAND_INDEX / TILE_COLS);
        const distance = Math.hypot(col - centerCol, row - centerRow);
        const waveTravel = impactLife > 0 ? impactLife * 1.85 : -1;
        const wave = impactLife > 0 ? Math.max(0, 1 - Math.abs(waveTravel - distance) * 0.72) : 0;
        const returnMoment = impactLife > 0 && waveTravel - distance > 0.42;
        if (returnMoment && !droppedTileSounds.has(index)) {
          droppedTileSounds.add(index);
          playDropSound(index === CURRENT_BRAND_INDEX ? 0.055 : 0.032);
        }
        const damping = Math.exp(Math.max(0, impactLife) * -0.38);
        const tremor = Math.sin(impactLife * 25 + distance * 2.2) * wave * damping;
        const radialX = col === centerCol && row === centerRow ? 0 : (col - centerCol) / Math.max(distance, 1);
        const radialY = col === centerCol && row === centerRow ? 0 : (row - centerRow) / Math.max(distance, 1);
        const push = wave * damping * 0.24;
        const jitter = tremor * 0.075;
        const lift = wave * damping * 0.14;
        const hoverAmount = inserted && hoveredWallTileIndex === index ? 1 : 0;
        const tileTremble = hoverAmount ? Math.sin(elapsed * 28 + index * 0.7) * 0.04 : 0;
        let hoverRotX = 0;
        let hoverRotY = 0;
        let hoverRotZ = 0;
        if (hoverAmount) {
          const relX = THREE.MathUtils.clamp((hoverWorld.x - mesh.userData.baseX) / (tileWidth / 2), -1, 1);
          const relY = THREE.MathUtils.clamp((hoverWorld.y - mesh.userData.baseY) / (tileHeight / 2), -1, 1);
          hoverRotY = relX * 0.42 + tileTremble * 0.82;
          hoverRotX = -relY * 0.31 + tileTremble * 0.62;
          hoverRotZ = Math.sin(elapsed * 22 + index) * 0.014;
        }
        mesh.position.x = mesh.userData.baseX + radialX * push + jitter;
        mesh.position.y = mesh.userData.baseY - radialY * push + tremor * 0.012;
        mesh.position.z = lift + hoverAmount * 0.04;
        mesh.rotation.x = THREE.MathUtils.damp(mesh.rotation.x, hoverRotX, 18, delta);
        mesh.rotation.y = THREE.MathUtils.damp(mesh.rotation.y, hoverRotY, 18, delta);
        mesh.rotation.z = THREE.MathUtils.damp(mesh.rotation.z, hoverRotZ, 18, delta);
      });

      if (inserted) {
        const hoverAmount = hoveredWallTileIndex === CURRENT_BRAND_INDEX ? 1 : 0;
        let hoverRotX = 0;
        let hoverRotY = 0;
        let hoverRotZ = 0;
        if (hoverAmount) {
          const relX = THREE.MathUtils.clamp((hoverWorld.x - targetX) / (tileWidth / 2), -1, 1);
          const relY = THREE.MathUtils.clamp((hoverWorld.y - targetY) / (tileHeight / 2), -1, 1);
          const tileTremble = Math.sin(elapsed * 28 + CURRENT_BRAND_INDEX * 0.7) * 0.04;
          hoverRotY = relX * 0.5 + tileTremble;
          hoverRotX = -relY * 0.38 + tileTremble * 0.75;
          hoverRotZ = Math.sin(elapsed * 22 + CURRENT_BRAND_INDEX) * 0.018;
        }
        currentBrandWallTile.position.z = 0.05 + hoverAmount * 0.045;
        currentBrandWallTile.rotation.x = THREE.MathUtils.damp(currentBrandWallTile.rotation.x, hoverRotX, 18, delta);
        currentBrandWallTile.rotation.y = THREE.MathUtils.damp(currentBrandWallTile.rotation.y, hoverRotY, 18, delta);
        currentBrandWallTile.rotation.z = THREE.MathUtils.damp(currentBrandWallTile.rotation.z, hoverRotZ, 18, delta);
      } else {
        currentBrandWallTile.position.z = 0.05;
        currentBrandWallTile.rotation.x = THREE.MathUtils.damp(currentBrandWallTile.rotation.x, 0, 10, delta);
        currentBrandWallTile.rotation.y = THREE.MathUtils.damp(currentBrandWallTile.rotation.y, 0, 10, delta);
        currentBrandWallTile.rotation.z = THREE.MathUtils.damp(currentBrandWallTile.rotation.z, 0, 10, delta);
      }

      renderer.render(scene, camera);
      if (!firstFrameRendered) {
        firstFrameRendered = true;
        notifyReady();
      }
    };
    animate();

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', layoutTiles);
      host.removeEventListener('pointerdown', handlePointerDown);
      host.removeEventListener('pointermove', handlePointerMove);
      host.removeEventListener('pointerup', handlePointerUp);
      host.removeEventListener('pointercancel', handlePointerUp);
      host.removeEventListener('pointerleave', handlePointerLeave);
      host.removeEventListener('click', handleClick);
      setRevealStageLight(false);
      renderer.dispose();
      tileGeometry.dispose();
      floatingTileGeometry.dispose();
      overlayGeometry.dispose();
      particleGeometry.dispose();
      particleMaterial.dispose();
      shockwave.geometry.dispose();
      shockwaveMaterial.dispose();
      if (lockedPlate) lockedPlate.material.dispose();
      if (crackOverlay) crackOverlay.material.dispose();
      revealShards.forEach((shard) => {
        shard.geometry.dispose();
        shard.material.dispose();
      });
      revealRays.forEach((ray) => {
        ray.geometry.dispose();
        ray.material.dispose();
      });
      crackLines.forEach((line) => {
        line.geometry.dispose();
        line.material.dispose();
      });
      if (buildingModel) {
        try {
          scene.remove(buildingModel);
          buildingModel.traverse((node) => {
            if (node.isMesh) {
              if (node.geometry) node.geometry.dispose();
              if (node.material) {
                const m = node.material;
                if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
                else m.dispose();
              }
            }
          });
        } catch (e) {
          // ignore disposal errors
        }
      }
      emptyTexture.dispose();
      currentBrandTexture.dispose();
      tileBackTexture.dispose();
      ceramicEdgeTexture.dispose();
      ritualsTexture.dispose();
      burgerkingTexture.dispose();
      lockedTexture.dispose();
      crackTexture.dispose();
      emptyMaterial.dispose();
      blankMaterial.dispose();
      ritualsMaterial.dispose();
      burgerkingMaterial.dispose();
      currentBrandMaterial.dispose();
      tileBackMaterial.dispose();
      ceramicSideMaterial.dispose();
      lockedMaterial.dispose();
      revealLightMaterial.dispose();
      crackOverlayMaterial.dispose();
      overlayMaterial.dispose();
      currentBrandWallTile.material.dispose();
      floatingMaterials.forEach((material) => material.dispose());
      if (host.contains(renderer.domElement)) host.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={hostRef} className="webgl-tile-wall" aria-label="LiveWall WebGL tiles" />;
}
