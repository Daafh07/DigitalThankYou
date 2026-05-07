'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

const TILE_COLS = 10;
const TILE_ROWS = 6;
const TILE_COUNT = TILE_COLS * TILE_ROWS;
const CURRENT_BRAND_INDEX = 24;
const EMPTY_TILE_TEXTURE = '/assets/textures/emptytile.svg';
const CURRENT_BRAND_TEXTURE = '/assets/textures/currentbrand.svg';
const RITUALS_TEXTURE = '/assets/textures/rituals.svg';
const BURGERKING_TEXTURE = '/assets/textures/burgerking.svg';
const TILE_BACK_TEXTURE = '/assets/textures/achterkantefteling.svg';
const CERAMIC_EDGE_TEXTURE = '/assets/textures/keramiek.jpg';
const DROP_SOUND = '/assets/audio/dropsound.mp3';
const FREE_TILE_SCALE = 3.75;
const FREE_TILE_Z = 2.25;
const TILE_DEPTH = 0.14;
const TILE_ART_ASPECT = 79 / 82;
const FOCUS_OVERLAY_OPACITY = 0.22;
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

export default function HeroScene({ onReady, onFocusOverlayChange } = {}) {
  const hostRef = useRef(null);

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
    let freeTileWidth = 1;
    let freeTileHeight = 1;
    let currentBrandWallTile = null;
    let floatingTile = null;
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
    let overlayOpacity = FOCUS_OVERLAY_OPACITY;
    let audioContext = null;
    let dropBuffer = null;
    let audioLoading = false;
    const droppedTileSounds = new Set();
    const flightDuration = 3.15;
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
    floatingTile = new THREE.Mesh(floatingTileGeometry, floatingMaterials);
    floatingTile.position.z = FREE_TILE_Z;
    floatingTile.renderOrder = 3;
    scene.add(floatingTile);

    const layoutTiles = () => {
      const width = host.clientWidth || 1;
      const height = host.clientHeight || 1;
      const aspect = width / height;

      viewWidth = 10;
      viewHeight = viewWidth / aspect;
      tileWidth = viewWidth / TILE_COLS;
      tileHeight = viewHeight / TILE_ROWS;

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
        const x = -viewWidth / 2 + tileWidth * (col + 0.5);
        const y = viewHeight / 2 - tileHeight * (row + 0.5);

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
      startY = -viewHeight * 0.04;
      if (!inserted && floatingTile) {
        floatingTile.position.set(startX, startY, FREE_TILE_Z);
        floatingTile.scale.set(freeTileWidth * FREE_TILE_SCALE, freeTileHeight * FREE_TILE_SCALE, 1);
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
      const col = Math.floor((world.x + viewWidth / 2) / tileWidth);
      const row = Math.floor((viewHeight / 2 - world.y) / tileHeight);

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
      if (insertionStarted || inserted || extracting) return;

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
      if (extracting) return;

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
      focusOverlay.visible = overlayOpacity > 0.003;

      const eased = easeInOutCubic(progress);
      const settle = smootherStep(progress);
      const arc = Math.sin(progress * Math.PI);
      const drift = insertionStarted && !extracting ? Math.sin(elapsed * 1.35) * (1 - settle) * 0.035 : 0;

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
      floatingMaterials.forEach((material, index) => {
        material.opacity = inserted ? Math.max(0, 1 - (elapsed - impactTime) * 3.2) : 1;
        material.transparent = index === 4 || inserted;
      });

      if (insertionStarted && !extracting && !inserted && progress >= 1) {
        inserted = true;
        impactTime = elapsed;
        currentBrandWallTile.material.opacity = 1;
      }

      const impactLife = impactTime == null ? -1 : elapsed - impactTime;
      const particlePulse = impactLife > 0 ? Math.exp(-impactLife * 0.95) : 0;
      particles.position.x = targetX;
      particles.position.y = targetY + Math.sin(elapsed * 0.2) * 0.025;
      particles.position.z = 0.02;
      particles.rotation.z = Math.sin(elapsed * 0.32) * 0.08 + Math.max(0, impactLife) * 0.18;
      const dustScale = impactLife > 0 ? 0.46 + Math.min(impactLife, 2.8) * 0.62 : 0.46;
      particles.scale.setScalar(dustScale);
      particleMaterial.opacity = particlePulse * 0.58;
      particleMaterial.size = 0.015 + particlePulse * 0.03;

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
      renderer.dispose();
      tileGeometry.dispose();
      floatingTileGeometry.dispose();
      overlayGeometry.dispose();
      particleGeometry.dispose();
      particleMaterial.dispose();
      shockwave.geometry.dispose();
      shockwaveMaterial.dispose();
      emptyTexture.dispose();
      currentBrandTexture.dispose();
      tileBackTexture.dispose();
      ceramicEdgeTexture.dispose();
      ritualsTexture.dispose();
      burgerkingTexture.dispose();
      emptyMaterial.dispose();
      blankMaterial.dispose();
      ritualsMaterial.dispose();
      burgerkingMaterial.dispose();
      currentBrandMaterial.dispose();
      tileBackMaterial.dispose();
      ceramicSideMaterial.dispose();
      overlayMaterial.dispose();
      currentBrandWallTile.material.dispose();
      floatingMaterials.forEach((material) => material.dispose());
      if (host.contains(renderer.domElement)) host.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={hostRef} className="webgl-tile-wall" aria-label="LiveWall WebGL tiles" />;
}
