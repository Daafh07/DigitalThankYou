'use client';

import { useEffect, useRef } from 'react';

const MODEL_PATH = '/assets/models/buildings/Livewall-gebouw.glb';

let preloadPromise = null;
let preloadedBuildingModel = null;

function normalizeBuildingMaterials(scene, THREE) {
  scene.traverse((node) => {
    if (!node.isMesh) return;

    node.frustumCulled = false;
    const originalMaterials = Array.isArray(node.material) ? node.material : [node.material];
    const replacementMaterials = originalMaterials.map((material) => new THREE.MeshBasicMaterial({
      color: '#ffffff',
      map: material?.map ?? null,
      alphaMap: material?.alphaMap ?? null,
      transparent: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    }));
    node.material = replacementMaterials.length === 1 ? replacementMaterials[0] : replacementMaterials;
  });
}

export async function preloadEntryBuildingModel() {
  if (preloadedBuildingModel) return preloadedBuildingModel;
  if (preloadPromise) return preloadPromise;

  preloadPromise = Promise.all([
    import('three'),
    import('three/examples/jsm/loaders/GLTFLoader.js'),
  ])
    .then(async ([threeNamespace, { GLTFLoader }]) => {
      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync(MODEL_PATH);
      normalizeBuildingMaterials(gltf.scene, threeNamespace);
      preloadedBuildingModel = gltf.scene;
      return preloadedBuildingModel;
    })
    .catch(() => null);

  return preloadPromise;
}

export default function EntryBuildingModel({ onReady } = {}) {
  const hostRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    let THREE = null;
    let scene = null;
    let renderer = null;
    let camera = null;
    let buildingModel = null;
    let frameId = 0;
    let disposed = false;
    let needsRenderLoop = true;

    const disposeModel = () => {
      if (!buildingModel || !scene) return;

      scene.remove(buildingModel);
      buildingModel.traverse((node) => {
        if (!node.isMesh) return;

        node.geometry?.dispose();
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        materials.forEach((material) => {
          Object.values(material).forEach((value) => {
            if (value?.isTexture) value.dispose();
          });
          material.dispose();
        });
      });
      buildingModel = null;
    };

    const init = async () => {
      const [threeNamespace, { GLTFLoader }] = await Promise.all([
        import('three'),
        import('three/examples/jsm/loaders/GLTFLoader.js'),
      ]);

      if (disposed) return;

      THREE = threeNamespace;
      scene = new THREE.Scene();
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      host.appendChild(renderer.domElement);

      camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
      camera.position.set(0, 0.55, 5.4);
      camera.lookAt(0, 0, 0);

      const render = () => {
        renderer.render(scene, camera);
      };

      const animate = () => {
        if (!needsRenderLoop) return;
        render();
        frameId = window.requestAnimationFrame(animate);
      };

      const resize = () => {
        const width = Math.max(1, host.clientWidth);
        const height = Math.max(1, host.clientHeight);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        render();
      };

      const fitModel = (model) => {
        const bounds = new THREE.Box3().setFromObject(model);
        const size = bounds.getSize(new THREE.Vector3());
        const center = bounds.getCenter(new THREE.Vector3());

        model.position.sub(center);

        const maxDimension = Math.max(size.x, size.y, size.z);
        if (maxDimension > 0) {
          model.scale.setScalar(3.00 / maxDimension);
        }

        model.rotation.set(0, 0, 0);
        model.updateWorldMatrix(true, true);

        const fittedBounds = new THREE.Box3().setFromObject(model);
        model.position.y -= fittedBounds.min.y + 1.25;
        model.position.x = 0;
        model.position.z = 0;
        render();
      };

      scene.add(new THREE.HemisphereLight(0xffffff, 0xd8e7ff, 2.25));

      const keyLight = new THREE.DirectionalLight(0xffffff, 2.8);
      keyLight.position.set(3.5, 5, 5);
      scene.add(keyLight);

      const fillLight = new THREE.DirectionalLight(0xbfd8ff, 1.2);
      fillLight.position.set(-4, 2.5, 3);
      scene.add(fillLight);

      const loader = new GLTFLoader();
      const showBuilding = (model) => {
        if (disposed || !model) return;
        buildingModel = model;
        scene.add(buildingModel);
        fitModel(buildingModel);
        window.requestAnimationFrame(() => {
          render();
          onReady?.();
        });
      };

      preloadEntryBuildingModel().then((preloadedModel) => {
        if (disposed) return;
        if (preloadedModel) {
          showBuilding(preloadedModel);
          return;
        }

        loader.load(
          MODEL_PATH,
          (gltf) => {
            if (disposed) return;
            normalizeBuildingMaterials(gltf.scene, THREE);
            preloadedBuildingModel = gltf.scene;
            showBuilding(preloadedBuildingModel);
          },
          undefined,
          () => {
            render();
          },
        );
      });

      resize();
      window.addEventListener('resize', resize);
      frameId = window.requestAnimationFrame(animate);

      return () => {
        window.removeEventListener('resize', resize);
      };
    };

    let removeResizeListener = null;
    init().then((cleanup) => {
      removeResizeListener = cleanup;
    });

    return () => {
      disposed = true;
      needsRenderLoop = false;
      window.cancelAnimationFrame(frameId);
      removeResizeListener?.();
      disposeModel();
      renderer?.dispose();
      if (renderer?.domElement && host.contains(renderer.domElement)) {
        host.removeChild(renderer.domElement);
      }
    };
  }, [onReady]);

  return <div ref={hostRef} className="entry-transition-building-3d" aria-hidden="true" />;
}
