'use client';

import { useEffect, useRef } from 'react';

const MODEL_PATH = '/assets/models/buildings/Livewall-gebouw.glb';

let preloadPromise = null;
let preloadedScene = null;

const CAM_START_Z   = 9.0;
const CAM_START_Y   = 0.2;
const CAM_END_Z     = 0.3;
const CAM_END_Y     = -0.85;
const HOLD_DURATION = 2.0;
const FLY_DURATION  = 3.2;
const FADE_START    = 0.55;

function smootherStep(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function normalizeMaterials(scene, THREE) {
  scene.traverse((node) => {
    if (!node.isMesh) return;
    node.frustumCulled = false;
    const originals = Array.isArray(node.material) ? node.material : [node.material];
    const replacements = originals.map((mat) => new THREE.MeshBasicMaterial({
      color: '#ffffff',
      map: mat?.map ?? null,
      alphaMap: mat?.alphaMap ?? null,
      transparent: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    }));
    node.material = replacements.length === 1 ? replacements[0] : replacements;
  });
}

export async function preloadEntryBuildingModel() {
  if (preloadedScene) return preloadedScene;
  if (preloadPromise) return preloadPromise;

  preloadPromise = Promise.all([
    import('three'),
    import('three/examples/jsm/loaders/GLTFLoader.js'),
  ])
    .then(async ([THREE, { GLTFLoader }]) => {
      const gltf = await new GLTFLoader().loadAsync(MODEL_PATH);
      normalizeMaterials(gltf.scene, THREE);
      preloadedScene = gltf.scene;
      return preloadedScene;
    })
    .catch(() => null);

  return preloadPromise;
}

// onFadeProgress(0-1): parent kan de witte overlay bijwerken
// onReady: camera is volledig in de deur (fade = 1)
export default function EntryBuildingModel({ onFadeProgress, onReady } = {}) {
  const hostRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    let THREE         = null;
    let scene         = null;
    let renderer      = null;
    let camera        = null;
    let buildingModel = null;
    let frameId       = 0;
    let disposed      = false;
    let looping       = true;

    const disposeModel = () => {
      if (!buildingModel || !scene) return;
      scene.remove(buildingModel);
      buildingModel.traverse((node) => {
        if (!node.isMesh) return;
        node.geometry?.dispose();
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        mats.forEach((mat) => {
          Object.values(mat).forEach((v) => { if (v?.isTexture) v.dispose(); });
          mat.dispose();
        });
      });
      buildingModel = null;
    };

    const init = async () => {
      const [threeNS, { GLTFLoader }] = await Promise.all([
        import('three'),
        import('three/examples/jsm/loaders/GLTFLoader.js'),
      ]);

      if (disposed) return undefined;

      THREE = threeNS;
      scene = new THREE.Scene();

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      host.appendChild(renderer.domElement);

      camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
      camera.position.set(0, CAM_START_Y, CAM_START_Z);
      camera.lookAt(0, CAM_START_Y - 0.1, 0);

      scene.add(new THREE.HemisphereLight(0xffffff, 0xd8e7ff, 2.25));
      const keyLight = new THREE.DirectionalLight(0xffffff, 2.8);
      keyLight.position.set(3.5, 5, 5);
      scene.add(keyLight);
      const fillLight = new THREE.DirectionalLight(0xbfd8ff, 1.2);
      fillLight.position.set(-4, 2.5, 3);
      scene.add(fillLight);

      let animStartTime = null;
      let readyFired    = false;
      let buildingReady = false;
      let lastFade      = -1;

      const render = () => renderer.render(scene, camera);

      const animate = (now) => {
        if (!looping) return;

        if (buildingReady && animStartTime !== null) {
          const elapsed = (now - animStartTime) / 1000;
          const rawT    = Math.min(elapsed / FLY_DURATION, 1);
          const t       = smootherStep(rawT);

          const camZ   = CAM_START_Z + (CAM_END_Z - CAM_START_Z) * t;
          const camY   = CAM_START_Y + (CAM_END_Y - CAM_START_Y) * t;
          const lookY  = (CAM_START_Y - 0.1) + (CAM_END_Y - 0.1 - (CAM_START_Y - 0.1)) * t;
          camera.position.set(0, camY, camZ);
          camera.lookAt(0, lookY, 0);

          // Bereken fade-waarde en stuur naar parent
          const fadeT = rawT >= FADE_START
            ? smootherStep(Math.min((rawT - FADE_START) / (1 - FADE_START), 1))
            : 0;

          if (Math.abs(fadeT - lastFade) > 0.005) {
            lastFade = fadeT;
            onFadeProgress?.(fadeT);
          }

          if (rawT >= 0.96 && !readyFired) {
            readyFired = true;
            onFadeProgress?.(1);
            onReady?.();
          }
        }

        render();
        frameId = window.requestAnimationFrame(animate);
      };

      const resize = () => {
        const w = Math.max(1, host.clientWidth);
        const h = Math.max(1, host.clientHeight);
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        render();
      };

      const fitModel = (model) => {
        const bounds = new THREE.Box3().setFromObject(model);
        const size   = bounds.getSize(new THREE.Vector3());
        const center = bounds.getCenter(new THREE.Vector3());
        model.position.sub(center);
        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 0) model.scale.setScalar(4.7 / maxDim);
        model.rotation.set(0, 0, 0);
        model.updateWorldMatrix(true, true);
        const fitted = new THREE.Box3().setFromObject(model);
        const fc = fitted.getCenter(new THREE.Vector3());
        model.position.y -= fc.y - 0.1;
        model.position.x = 0;
        model.position.z = 0;
        render();
      };

      const showBuilding = (model) => {
        if (disposed || !model) return;
        buildingModel = model;
        scene.add(buildingModel);
        fitModel(buildingModel);
        window.requestAnimationFrame(() => {
          render();
          buildingReady = true;
          window.setTimeout(() => {
            if (!disposed) animStartTime = performance.now();
          }, HOLD_DURATION * 1000);
        });
      };

      preloadEntryBuildingModel().then((cached) => {
        if (disposed) return;
        if (cached) { showBuilding(cached); return; }
        new GLTFLoader().load(MODEL_PATH, (gltf) => {
          if (disposed) return;
          normalizeMaterials(gltf.scene, THREE);
          preloadedScene = gltf.scene;
          showBuilding(preloadedScene);
        }, undefined, () => render());
      });

      resize();
      window.addEventListener('resize', resize);
      frameId = window.requestAnimationFrame(animate);
      return () => window.removeEventListener('resize', resize);
    };

    let cleanupResize = null;
    init().then((fn) => { cleanupResize = fn; });

    return () => {
      disposed = true;
      looping  = false;
      window.cancelAnimationFrame(frameId);
      cleanupResize?.();
      disposeModel();
      renderer?.dispose();
      if (renderer?.domElement && host.contains(renderer.domElement)) {
        host.removeChild(renderer.domElement);
      }
    };
  }, [onFadeProgress, onReady]);

  return <div ref={hostRef} className="entry-transition-building-3d" aria-hidden="true" />;
}
