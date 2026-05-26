'use client';

import { useEffect, useRef } from 'react';

// ─── Constants ────────────────────────────────────────────────────────────────

// Pad naar het 3D-gebouwmodel dat getoond wordt tijdens de ingangsanimatie.
const BUILDING_MODEL_PATH = '/assets/models/Livewall-gebouw.glb';

// Timing van de ingangsscène: een aaneengesloten beweging van buiten naar binnen.
const WALK_IN_DURATION = 6800;
const INSIDE_REVEAL_AT = 0.34;

// Camerapunten voor de zweefbeweging naar het gebouw toe.
const CAMERA_START = { x: 0, y: 0.16, z: 5.75 };
const CAMERA_DOOR  = { x: 0, y: -0.90, z: 1.18 };
const CAMERA_INSIDE = { x: 0, y: -0.90, z: 1.18 };

const LOOK_START = { x: 0, y: -0.34, z: 0 };
const LOOK_DOOR  = { x: 0, y: -0.52, z: -0.58 };
const LOOK_INSIDE = { x: 0, y: -0.52, z: -0.58 };

// ─── Module-level preload cache ───────────────────────────────────────────────

// Deze variabelen worden gedeeld over alle instanties van de component,
// zodat het model maximaal één keer per paginalading opgehaald wordt.
// preloadPromises – lopende fetch+parse beloftes per modelpad, zodat parallelle
//                   aanroepen niet elk een eigen verzoek starten.
// preloadedScenes – verwerkte Three.js-sceneobjecten per modelpad; klaar om te klonen.
const preloadPromises = new Map();
const preloadedScenes = new Map();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Vervangt elk mesh-materiaal in de GLTF-scène door een MeshBasicMaterial.
 * MeshBasicMaterial heeft geen lichtbronnen nodig, wat de opzet sterk vereenvoudigt
 * en garandeert dat het gebouw er overal hetzelfde uitziet ongeacht de verlichtingsopbouw.
 */
function normalizeMaterials(scene, THREE) {
  scene.traverse((node) => {
    if (!node.isMesh) return;

    // Zorg dat de mesh altijd getekend wordt, ook als hij buiten het frustum valt.
    node.frustumCulled = false;

    const originals = Array.isArray(node.material) ? node.material : [node.material];
    const replacements = originals.map((mat) => new THREE.MeshBasicMaterial({
      color: '#ffffff',
      map: mat?.map ?? null,           // behoud de albedo-textuur
      alphaMap: mat?.alphaMap ?? null, // behoud eventuele transparantiemask
      transparent: false,
      side: THREE.DoubleSide,          // teken voor- én achterkant zodat er geen gaten zijn
      toneMapped: false,
    }));

    node.material = replacements.length === 1 ? replacements[0] : replacements;
  });
}

// ─── Exports ──────────────────────────────────────────────────────────────────

/**
 * Start het laden van Three.js en het GLB-gebouwmodel op de achtergrond.
 * Roep deze functie zo vroeg mogelijk aan (bijv. bij het mounten van de app)
 * zodat het model al klaar is wanneer EntryBuildingModel later gemount wordt.
 *
 * Terugkerende aanroepen retourneren dezelfde belofte of het gecachede sceneobject,
 * zodat er nooit twee parallelle netwerkverzoeken plaatsvinden.
 */
export async function preloadEntryBuildingModel() {
  return preloadModel(BUILDING_MODEL_PATH);
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
}

function easeOutQuint(t) {
  return 1 - ((1 - t) ** 5);
}

function lerp(a, b, t) {
  return a + ((b - a) * t);
}

async function preloadModel(path) {
  if (preloadedScenes.has(path)) return preloadedScenes.get(path);
  if (preloadPromises.has(path)) return preloadPromises.get(path);

  const promise = Promise.all([
    import('three'),
    import('three/examples/jsm/loaders/GLTFLoader.js'),
  ])
    .then(async ([THREE, { GLTFLoader }]) => {
      // Laad en parse het GLB-bestand; normaliseer daarna de materialen.
      const gltf = await new GLTFLoader().loadAsync(path);
      normalizeMaterials(gltf.scene, THREE);
      preloadedScenes.set(path, gltf.scene);
      return gltf.scene;
    })
    .catch(() => null); // bij een fout null teruggeven zodat de component graceful degradeert

  preloadPromises.set(path, promise);
  return promise;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Rendert het Livewall-gebouw GLB in een kale WebGL-canvas.
 * Roept onReady aan nadat het eerste frame op het scherm getekend is,
 * zodat de bovenliggende component weet dat het gebouw zichtbaar is.
 *
 * De complete Three.js-lifecycle (opbouw, animatielus en afbraak) wordt beheerd
 * binnen één useEffect zodat er geen state-lekken optreden bij unmounting.
 */
export default function EntryBuildingModel({ onReady, onInsideReached, onComplete } = {}) {
  const hostRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    // Gedeelde mutatievariabelen tussen init(), animate() en cleanup.
    let THREE         = null;
    let scene         = null;
    let renderer      = null;
    let camera        = null;
    let buildingModel = null;
    let walkTimer     = 0;
    let walkStartTime = null;
    let frameId       = 0;
    let disposed      = false; // voorkomt setState na unmount
    let looping       = true;  // zet op false om de animatielus te stoppen
    let insideNotified = false;
    let completionNotified = false;

    // ── Dispose helpers ──────────────────────────────────────────────────────

    // Verwijdert het gebouwmodel uit de scène en geeft alle GPU-geheugen vrij
    // (geometrieën, texturen en materialen).
    const removeBuildingModel = () => {
      if (!buildingModel || !scene) return;
      scene.remove(buildingModel);
      buildingModel = null;
    };

    // ── Main async init ──────────────────────────────────────────────────────

    const init = async () => {
      // Importeer Three.js en GLTFLoader tegelijk zodat geen tijd verloren gaat.
      const [threeNS, { GLTFLoader }] = await Promise.all([
        import('three'),
        import('three/examples/jsm/loaders/GLTFLoader.js'),
      ]);

      // Sla op als de component al unmountte tijdens het laden.
      if (disposed) return undefined;

      THREE = threeNS;
      scene = new THREE.Scene();

      // Maak een transparante WebGL-renderer aan en voeg die toe aan de host-div.
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
      renderer.setClearColor(0x000000, 0); // volledig transparante achtergrond
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      host.appendChild(renderer.domElement);

      // Perspectiefcamera die het gebouw enigszins van voren en iets boven-middel toont.
      camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
      camera.position.set(CAMERA_START.x, CAMERA_START.y, CAMERA_START.z);
      camera.lookAt(LOOK_START.x, LOOK_START.y, LOOK_START.z);

      // ── Lights ──────────────────────────────────────────────────────────────

      // Hemisfeerlicht simuleert hemel (wit) en grondreflectie (lichtblauw).
      scene.add(new THREE.HemisphereLight(0xffffff, 0xd8e7ff, 2.25));

      // Hoofdlichtbron (key light) van rechtsboven.
      const keyLight = new THREE.DirectionalLight(0xffffff, 2.8);
      keyLight.position.set(3.5, 5, 5);
      scene.add(keyLight);

      // Vullicht (fill light) van links om harde schaduwen te verzachten.
      const fillLight = new THREE.DirectionalLight(0xbfd8ff, 1.2);
      fillLight.position.set(-4, 2.5, 3);
      scene.add(fillLight);

      // ── Render / resize / animate ────────────────────────────────────────────

      // Teken één frame.
      const render = () => renderer.render(scene, camera);

      // Animatielus: rendert continu frames zolang looping true is.
      const animate = (now) => {
        if (!looping) return;
        if (walkStartTime !== null) {
          const progress = Math.min(1, (now - walkStartTime) / WALK_IN_DURATION);
          const doorPhase = Math.min(1, progress / 0.54);
          const insidePhase = Math.max(0, (progress - 0.44) / 0.56);
          const approach = easeInOutCubic(doorPhase);
          const interior = easeInOutCubic(insidePhase);
          const settle = 1 - progress;
          const bob = Math.sin(progress * Math.PI * 2.2) * 0.045 * settle;
          const driftX = Math.sin(progress * Math.PI * 1.15) * 0.055 * settle;
          const doorX = lerp(CAMERA_START.x, CAMERA_DOOR.x, approach);
          const doorY = lerp(CAMERA_START.y, CAMERA_DOOR.y, approach);
          const doorZ = lerp(CAMERA_START.z, CAMERA_DOOR.z, approach);
          const cameraX = lerp(doorX, CAMERA_INSIDE.x, interior) + driftX;
          const cameraY = lerp(doorY, CAMERA_INSIDE.y, interior) + bob;
          const cameraZ = lerp(doorZ, CAMERA_INSIDE.z, interior);
          const lookDoorX = lerp(LOOK_START.x, LOOK_DOOR.x, approach);
          const lookDoorY = lerp(LOOK_START.y, LOOK_DOOR.y, approach);
          const lookDoorZ = lerp(LOOK_START.z, LOOK_DOOR.z, approach);
          const lookX = lerp(lookDoorX, LOOK_INSIDE.x, interior) + (driftX * 0.18);
          const lookY = lerp(lookDoorY, LOOK_INSIDE.y, interior);
          const lookZ = lerp(lookDoorZ, LOOK_INSIDE.z, interior);
          const doorFocus = easeInOutCubic(Math.min(1, progress / 0.42));
          const shadowOpacity = Math.min(0.84, Math.sin(progress * Math.PI) * 0.72);

          camera.position.set(cameraX, cameraY, cameraZ);
          camera.lookAt(lookX, lookY, lookZ);
          camera.fov = lerp(32, 50, approach);
          camera.updateProjectionMatrix();
          host.style.setProperty('--entry-door-width', `${7 + (doorFocus * 172)}%`);
          host.style.setProperty('--entry-door-height', `${20 + (doorFocus * 168)}%`);
          host.style.setProperty('--entry-shadow-opacity', shadowOpacity.toFixed(4));
          host.style.setProperty('--entry-inset-opacity', (shadowOpacity * 0.42).toFixed(4));
          host.style.setProperty('--entry-canvas-scale', (1 + (approach * 0.06)).toFixed(4));
          host.style.setProperty('--entry-canvas-opacity', '1');
          host.style.setProperty('--entry-speed-opacity', '0');
          host.style.setProperty('--entry-flash-opacity', '0');
          host.style.setProperty('--entry-chrome-opacity', (1 - Math.min(1, progress * 1.35)).toFixed(4));

          if (!insideNotified && progress >= INSIDE_REVEAL_AT) {
            insideNotified = true;
            host.classList.add('entry-transition-building-inside');
            onInsideReached?.();
          }

          if (!completionNotified && progress >= 1) {
            completionNotified = true;
            host.classList.add('entry-transition-building-complete');
            onComplete?.();
          }
        }
        render();
        frameId = window.requestAnimationFrame(animate);
      };

      // Past de canvasgrootte en cameraverhouding aan bij een venstergroottewisseling.
      const resize = () => {
        const w = Math.max(1, host.clientWidth);
        const h = Math.max(1, host.clientHeight);
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        render();
      };

      // ── Model fitting ────────────────────────────────────────────────────────

      /**
       * Centreert het model op de oorsprong, schaalt het zodat het de view vult,
       * en zet het op de grond (zodat het gebouw niet zweeft).
       */
      const fitModel = (model) => {
        const bounds = new THREE.Box3().setFromObject(model);
        const size   = bounds.getSize(new THREE.Vector3());
        const center = bounds.getCenter(new THREE.Vector3());

        // Verschuif het model zodat zijn middelpunt op de oorsprong ligt.
        model.position.sub(center);

        // Schaal zodat de langste zijde gelijk is aan 3 world-units.
        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 0) model.scale.setScalar(3.0 / maxDim);

        model.rotation.set(0, 0, 0);
        model.updateWorldMatrix(true, true);

        // Zet de onderkant van het gebouw op y = -1.25 (iets onder het midden).
        const fitted = new THREE.Box3().setFromObject(model);
        model.position.y -= fitted.min.y + 1.25;
        model.position.x = 0;
        model.position.z = 0;
        render();

      };

      /**
       * Voegt het gebouwmodel toe aan de scène, past de afmetingen aan en
       * roept onReady aan nadat het eerste frame getekend is.
       */
      const showBuilding = (model) => {
        if (disposed || !model) return;
        removeBuildingModel();
        buildingModel = model;
        scene.add(buildingModel);
        fitModel(buildingModel);
        render();
      };

      // ── Load (prefer the preloaded cache) ────────────────────────────────────

      // Toon het gebouw zodra het model klaar is.
      preloadEntryBuildingModel().then((loadedBuildingModel) => {
        if (disposed) return;
        if (loadedBuildingModel) {
          showBuilding(loadedBuildingModel.clone(true));

          // requestAnimationFrame zorgt dat onReady pas afgaat nà de eerste render.
          window.requestAnimationFrame(() => { render(); onReady?.(); });

          walkTimer = window.requestAnimationFrame(() => {
            if (!disposed) {
              walkStartTime = performance.now();
              host.classList.add('entry-transition-building-entering');
            }
          });

          return;
        }

        // Fallback: laad het model direct als de preload om een of andere reden mislukt.
        new GLTFLoader().load(BUILDING_MODEL_PATH, (gltf) => {
          if (disposed) return;
          normalizeMaterials(gltf.scene, THREE);
          preloadedScenes.set(BUILDING_MODEL_PATH, gltf.scene);
          showBuilding(gltf.scene.clone(true));
          window.requestAnimationFrame(() => { render(); onReady?.(); });
        }, undefined, () => render());
      });

      resize();
      window.addEventListener('resize', resize);
      frameId = window.requestAnimationFrame(animate);

      // Geef een cleanup-functie terug die de resize-listener verwijdert.
      return () => window.removeEventListener('resize', resize);
    };

    // ── Boot ─────────────────────────────────────────────────────────────────

    // Start de async initialisatie en sla de resize-cleanup op voor later.
    let cleanupResize = null;
    init().then((fn) => { cleanupResize = fn; });

    // ── Teardown ─────────────────────────────────────────────────────────────

    // Wordt aangeroepen als de component unmount: stop de lus, geef GPU-geheugen vrij
    // en verwijder de canvas uit de DOM.
    return () => {
      disposed = true;
      looping  = false;
      window.cancelAnimationFrame(walkTimer);
      window.cancelAnimationFrame(frameId);
      host.classList.remove('entry-transition-building-entering');
      host.classList.remove('entry-transition-building-inside');
      host.classList.remove('entry-transition-building-complete');
      host.style.removeProperty('--entry-door-width');
      host.style.removeProperty('--entry-door-height');
      host.style.removeProperty('--entry-shadow-opacity');
      host.style.removeProperty('--entry-inset-opacity');
      host.style.removeProperty('--entry-canvas-scale');
      host.style.removeProperty('--entry-canvas-opacity');
      host.style.removeProperty('--entry-speed-opacity');
      host.style.removeProperty('--entry-flash-opacity');
      host.style.removeProperty('--entry-chrome-opacity');
      cleanupResize?.();
      removeBuildingModel();
      renderer?.dispose();
      if (renderer?.domElement && host.contains(renderer.domElement)) {
        host.removeChild(renderer.domElement);
      }
    };
  }, [onReady]);

  return (
    <div ref={hostRef} className="entry-transition-building-3d" aria-hidden="true">
      <div className="entry-doorway-shadow" />
      <div className="entry-speed-glow" />
      <div className="entry-inside-flash" />
    </div>
  );
}
