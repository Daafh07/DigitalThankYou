'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

const TILE_COLS = 9;
const TILE_ROWS = 5;
const TILE_COUNT = TILE_COLS * TILE_ROWS;
const TILE_SIZE = 0.7;
const TILE_GAP = 0.705;
const WALL_Z = -0.62;
const INSERTED_LIFT = 0.06;
const FLOATING_TILE_Z = 1.15;
const LANDED_TILE_Z_OFFSET = 0.018;
const EMPTY_TILE_TEXTURE = '/assets/textures/emptytile.svg';
const CURRENT_BRAND_TEXTURE = '/assets/textures/currentbrand.svg';

function playTone(frequency, duration, gain = 0.03) {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;

  const context = new AudioContext();
  const oscillator = context.createOscillator();
  const envelope = context.createGain();
  oscillator.frequency.value = frequency;
  oscillator.type = 'sine';
  envelope.gain.setValueAtTime(0.0001, context.currentTime);
  envelope.gain.exponentialRampToValueAtTime(gain, context.currentTime + 0.02);
  envelope.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
  oscillator.connect(envelope).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + duration + 0.04);
}

function configureSvgTexture(texture, renderer) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function loadSvgTexture(url, renderer, version, size = 2048) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.fillStyle = '#fff8ee';
  context.fillRect(0, 0, size, size);

  const texture = configureSvgTexture(new THREE.CanvasTexture(canvas), renderer);
  const image = new Image();

  image.onload = () => {
    context.clearRect(0, 0, size, size);
    context.fillStyle = '#fff8ee';
    context.fillRect(0, 0, size, size);
    context.drawImage(image, 0, 0, size, size);
    texture.needsUpdate = true;
  };

  image.src = `${url}?v=${version}`;
  return texture;
}

export default function HeroScene() {
  const hostRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#020811');
    scene.fog = new THREE.Fog('#071523', 5.5, 18);

    const camera = new THREE.PerspectiveCamera(38, host.clientWidth / host.clientHeight, 0.1, 80);
    camera.position.set(0, 0.08, 6.8);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.setClearColor('#020811', 1);
    host.appendChild(renderer.domElement);

    const textureVersion = Date.now();
    const emptyTileTexture = loadSvgTexture(EMPTY_TILE_TEXTURE, renderer, textureVersion);
    const currentBrandTexture = loadSvgTexture(CURRENT_BRAND_TEXTURE, renderer, textureVersion);

    const ambient = new THREE.AmbientLight('#7893b4', 0.55);
    const key = new THREE.DirectionalLight('#dbe9ff', 2.1);
    key.position.set(-2.5, 2.8, 4);
    const gold = new THREE.PointLight('#d5a84d', 1.6, 6);
    gold.position.set(0, 0, 1.2);
    scene.add(ambient, key, gold);

    const wallGroup = new THREE.Group();
    wallGroup.position.z = WALL_Z;
    scene.add(wallGroup);

    const seamMaterial = new THREE.MeshBasicMaterial({
      color: '#d5a84d',
      transparent: true,
      opacity: 0.1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const seams = new THREE.Mesh(new THREE.PlaneGeometry(6.42, 3.58), seamMaterial);
    seams.position.z = -0.06;
    wallGroup.add(seams);

    const tileGeometry = new THREE.BoxGeometry(TILE_SIZE, TILE_SIZE, 0.055);
    const tileMaterial = new THREE.MeshStandardMaterial({ color: '#f4f1e8', roughness: 0.28, metalness: 0 });
    const wallTiles = new THREE.InstancedMesh(tileGeometry, tileMaterial, TILE_COUNT);
    wallGroup.add(wallTiles);

    const tileFaceGeometry = new THREE.PlaneGeometry(0.692, 0.692);
    const tileFaceMaterial = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      map: emptyTileTexture,
      toneMapped: false,
    });
    const wallFaces = new THREE.InstancedMesh(tileFaceGeometry, tileFaceMaterial, TILE_COUNT);
    wallGroup.add(wallFaces);

    const tileData = Array.from({ length: TILE_COUNT }, (_, index) => {
      const x = (index % TILE_COLS - (TILE_COLS - 1) / 2) * TILE_GAP;
      const y = (Math.floor(index / TILE_COLS) - (TILE_ROWS - 1) / 2) * -TILE_GAP;
      return {
        x,
        y,
        distance: Math.sqrt(x * x + y * y),
        phase: index * 0.73,
        isCenter: Math.abs(x) < 0.05 && Math.abs(y) < 0.05,
      };
    });
    const dummy = new THREE.Object3D();

    const tile = new THREE.Group();
    tile.position.set(0, 0.1, FLOATING_TILE_Z);
    tile.scale.setScalar(1.26);
    scene.add(tile);

    const tileBody = new THREE.Mesh(
      new THREE.BoxGeometry(TILE_SIZE, TILE_SIZE, 0.08),
      new THREE.MeshStandardMaterial({ color: '#fff8ee', roughness: 0.22, metalness: 0 }),
    );
    tile.add(tileBody);

    const currentBrandFace = new THREE.Mesh(
      new THREE.PlaneGeometry(0.692, 0.692),
      new THREE.MeshBasicMaterial({
        color: '#ffffff',
        map: currentBrandTexture,
        toneMapped: false,
      }),
    );
    currentBrandFace.position.z = 0.043;
    tile.add(currentBrandFace);

    const particleGeometry = new THREE.BufferGeometry();
    const particleCount = 120;
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * 9;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 5;
      positions[i * 3 + 2] = -1.5 + Math.random() * 4;
    }
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particles = new THREE.Points(
      particleGeometry,
      new THREE.PointsMaterial({
        color: '#e1c175',
        size: 0.018,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    scene.add(particles);

    const shockwave = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.01, 8, 64),
      new THREE.MeshBasicMaterial({
        color: '#d5a84d',
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    shockwave.position.z = -0.48;
    scene.add(shockwave);

    const pointer = { x: 0, y: 0, hovering: false };
    let insertionStarted = false;
    let inserted = false;
    let progress = 0;
    let impactAt = null;
    let frameId = 0;
    const clock = new THREE.Clock();

    const startInsertion = () => {
      if (insertionStarted) return;
      insertionStarted = true;
      try {
        playTone(160, 0.5, 0.012);
      } catch {
        // Audio may be blocked until a user gesture; visual motion should continue.
      }
    };

    const timer = window.setTimeout(startInsertion, 900);

    const handlePointerMove = (event) => {
      const rect = host.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
      startInsertion();
    };
    const handlePointerEnter = () => {
      pointer.hovering = true;
      startInsertion();
    };
    const handlePointerLeave = () => {
      pointer.hovering = false;
    };

    host.addEventListener('pointermove', handlePointerMove);
    host.addEventListener('pointerenter', handlePointerEnter);
    host.addEventListener('pointerleave', handlePointerLeave);
    host.addEventListener('click', startInsertion);

    const resize = () => {
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    };
    window.addEventListener('resize', resize);

    const animate = () => {
      frameId = window.requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), 0.04);
      const elapsed = clock.elapsedTime;

      camera.position.x = THREE.MathUtils.damp(camera.position.x, pointer.x * 0.22 + Math.sin(elapsed * 0.34) * 0.18, 1.8, delta);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, pointer.y * 0.12 + Math.cos(elapsed * 0.27) * 0.08, 1.8, delta);
      camera.position.z = THREE.MathUtils.damp(camera.position.z, insertionStarted ? 6.1 : 6.7, 1.35, delta);
      camera.lookAt(pointer.x * 0.1, pointer.y * 0.05, 0);

      const impactLife = impactAt == null ? -1 : elapsed - impactAt;
      const centerWave = impactLife > 0 ? Math.max(0, 1 - Math.abs(impactLife * 2.2) * 1.55) : 0;
      const centerLift = centerWave * Math.exp(Math.max(0, impactLife) * -1.15) * 0.42 + (inserted ? INSERTED_LIFT : 0);

      tileData.forEach((data, index) => {
        const wave = impactLife > 0 ? Math.max(0, 1 - Math.abs(impactLife * 2.2 - data.distance) * 1.55) : 0;
        const dampedWave = wave * Math.exp(Math.max(0, impactLife) * -1.15);
        const z = dampedWave * 0.42 + Math.sin(elapsed * 0.8 + data.phase) * 0.018 + (inserted && data.isCenter ? INSERTED_LIFT : 0);

        dummy.position.set(data.x, data.y, z);
        dummy.rotation.set(pointer.y * 0.01, -pointer.x * 0.01, 0);
        dummy.scale.setScalar(inserted && data.isCenter ? 1.03 : 1);
        dummy.updateMatrix();
        wallTiles.setMatrixAt(index, dummy.matrix);

        dummy.position.set(data.x, data.y, z + 0.036);
        dummy.rotation.set(pointer.y * 0.01, -pointer.x * 0.01, 0);
        if (inserted && data.isCenter) {
          dummy.scale.set(0, 0, 0);
        } else {
          dummy.scale.set(1, 1, 1);
        }
        dummy.updateMatrix();
        wallFaces.setMatrixAt(index, dummy.matrix);
      });
      wallTiles.instanceMatrix.needsUpdate = true;
      wallFaces.instanceMatrix.needsUpdate = true;

      if (!insertionStarted) {
        tile.position.x = THREE.MathUtils.damp(tile.position.x, pointer.x * 0.28, 4, delta);
        tile.position.y = THREE.MathUtils.damp(tile.position.y, pointer.y * 0.18 + Math.sin(elapsed * 1.1) * 0.05, 4, delta);
        tile.rotation.x = THREE.MathUtils.damp(tile.rotation.x, pointer.y * -0.24, 4, delta);
        tile.rotation.y = THREE.MathUtils.damp(tile.rotation.y, pointer.x * 0.38, 4, delta);
      } else if (!inserted) {
        progress = Math.min(1, progress + delta / 2.2);
        const eased = progress * progress * (3 - 2 * progress);
        tile.position.x = THREE.MathUtils.damp(tile.position.x, 0, 5, delta);
        tile.position.y = THREE.MathUtils.damp(tile.position.y, 0, 5, delta);
        tile.position.z = THREE.MathUtils.lerp(FLOATING_TILE_Z, WALL_Z + INSERTED_LIFT + LANDED_TILE_Z_OFFSET, eased);
        tile.rotation.x = THREE.MathUtils.damp(tile.rotation.x, 0, 4, delta);
        tile.rotation.y = THREE.MathUtils.damp(tile.rotation.y, 0, 4, delta);
        tile.scale.setScalar(THREE.MathUtils.lerp(1.26, 1, eased));

        if (progress >= 1) {
          inserted = true;
          impactAt = elapsed;
          try {
            playTone(58, 0.8, 0.04);
            playTone(296, 0.35, 0.018);
          } catch {
            // Audio may be blocked until a user gesture; visual motion should continue.
          }
        }
      } else {
        tile.position.x = THREE.MathUtils.damp(tile.position.x, 0, 7, delta);
        tile.position.y = THREE.MathUtils.damp(tile.position.y, 0, 7, delta);
        tile.position.z = WALL_Z + centerLift + LANDED_TILE_Z_OFFSET;
        tile.rotation.x = THREE.MathUtils.damp(tile.rotation.x, pointer.y * 0.01, 4, delta);
        tile.rotation.y = THREE.MathUtils.damp(tile.rotation.y, -pointer.x * 0.01, 4, delta);
        tile.scale.setScalar(1);
      }

      particles.rotation.y = Math.sin(elapsed * 0.08) * 0.08;
      particles.position.y = Math.sin(elapsed * 0.12) * 0.05;
      seamMaterial.opacity = 0.08 + (impactLife > 0 ? Math.exp(-impactLife * 1.8) * 0.2 : 0);
      gold.intensity = 1.6 + (impactLife > 0 ? Math.exp(-impactLife * 1.35) * 6 : 0);

      if (impactLife > 0 && impactLife < 2.7) {
        shockwave.visible = true;
        shockwave.scale.setScalar(0.18 + impactLife * 2.25);
        shockwave.material.opacity = Math.max(0, 0.34 * (1 - impactLife / 2.7));
      } else {
        shockwave.material.opacity = 0;
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      window.clearTimeout(timer);
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', resize);
      host.removeEventListener('pointermove', handlePointerMove);
      host.removeEventListener('pointerenter', handlePointerEnter);
      host.removeEventListener('pointerleave', handlePointerLeave);
      host.removeEventListener('click', startInsertion);
      renderer.dispose();
      tileGeometry.dispose();
      tileFaceGeometry.dispose();
      emptyTileTexture.dispose();
      currentBrandTexture.dispose();
      particleGeometry.dispose();
      shockwave.geometry.dispose();
      host.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={hostRef} className="experience-canvas" />;
}
