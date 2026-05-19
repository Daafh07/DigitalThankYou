'use client';

import { useEffect, useRef } from 'react';

// ─── Constants ────────────────────────────────────────────────────────────────

// Pad naar het 3D-gebouwmodel dat getoond wordt tijdens de ingangsanimatie.
const MODEL_PATH = '/assets/models/buildings/Livewall-gebouw.glb';

// ─── Module-level preload cache ───────────────────────────────────────────────

// Deze variabelen worden gedeeld over alle instanties van de component,
// zodat het model maximaal één keer per paginalading opgehaald wordt.
// preloadPromise    – de lopende fetch+parse belofte, zodat parallelle aanroepen
//                    niet elk een eigen verzoek starten.
// preloadedScene    – het al verwerkte Three.js-sceneobject; klaar om te hergebruiken.
let preloadPromise = null;
let preloadedScene = null;

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
  if (preloadedScene)  return preloadedScene;
  if (preloadPromise)  return preloadPromise;

  preloadPromise = Promise.all([
    import('three'),
    import('three/examples/jsm/loaders/GLTFLoader.js'),
  ])
    .then(async ([THREE, { GLTFLoader }]) => {
      // Laad en parse het GLB-bestand; normaliseer daarna de materialen.
      const gltf = await new GLTFLoader().loadAsync(MODEL_PATH);
      normalizeMaterials(gltf.scene, THREE);
      preloadedScene = gltf.scene;
      return preloadedScene;
    })
    .catch(() => null); // bij een fout null teruggeven zodat de component graceful degradeert

  return preloadPromise;
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
export default function EntryBuildingModel({ onReady } = {}) {
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
    let frameId       = 0;
    let disposed      = false; // voorkomt setState na unmount
    let looping       = true;  // zet op false om de animatielus te stoppen

    // ── Dispose helpers ──────────────────────────────────────────────────────

    // Verwijdert het gebouwmodel uit de scène en geeft alle GPU-geheugen vrij
    // (geometrieën, texturen en materialen).
    const disposeModel = () => {
      if (!buildingModel || !scene) return;
      scene.remove(buildingModel);
      buildingModel.traverse((node) => {
        if (!node.isMesh) return;
        node.geometry?.dispose();
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        mats.forEach((mat) => {
          // Geef alle texturen in het materiaal vrij.
          Object.values(mat).forEach((v) => { if (v?.isTexture) v.dispose(); });
          mat.dispose();
        });
      });
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
      camera.position.set(0, 0.55, 5.4);
      camera.lookAt(0, 0, 0);

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
      const animate = () => {
        if (!looping) return;
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
        buildingModel = model;
        scene.add(buildingModel);
        fitModel(buildingModel);
        // requestAnimationFrame zorgt dat onReady pas afgaat nà de eerste render.
        window.requestAnimationFrame(() => { render(); onReady?.(); });
      };

      // ── Load (prefer the preloaded cache) ────────────────────────────────────

      // Gebruik het al geladen model als dat beschikbaar is; laad anders opnieuw.
      preloadEntryBuildingModel().then((cached) => {
        if (disposed) return;
        if (cached) { showBuilding(cached); return; }

        // Fallback: laad het model direct als de preload om een of andere reden mislukt.
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
      window.cancelAnimationFrame(frameId);
      cleanupResize?.();
      disposeModel();
      renderer?.dispose();
      if (renderer?.domElement && host.contains(renderer.domElement)) {
        host.removeChild(renderer.domElement);
      }
    };
  }, [onReady]);

  return <div ref={hostRef} className="entry-transition-building-3d" aria-hidden="true" />;
}
