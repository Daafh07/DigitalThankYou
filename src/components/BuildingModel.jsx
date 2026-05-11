 'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export default function BuildingModel({ src = '/assets/models/buildings/Livewall-gebouw.glb' } = {}) {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const scene = new THREE.Scene();
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.pointerEvents = 'none';
    mount.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000);
    camera.position.set(0, 1.35, 4.2);
    camera.lookAt(0, 1.0, 0);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.85);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(5, 10, 7.5);
    scene.add(dir);
    const frontLight = new THREE.DirectionalLight(0xffffff, 0.6);
    frontLight.position.set(0, 2, 4);
    scene.add(frontLight);

    const loader = new GLTFLoader();
    let model = null;
    loader.load(
      src,
      (gltf) => {
        model = gltf.scene;
        model.rotation.y = 0.35;
        // basic adjustments: center and scale
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const scale = 2.35 / maxDim;
        model.scale.setScalar(scale);
        box.setFromObject(model);
        const center = new THREE.Vector3();
        box.getCenter(center);
        model.position.sub(center);
        model.position.y += 0.12;
        scene.add(model);

        const fittedBox = new THREE.Box3().setFromObject(model);
        const fittedSize = new THREE.Vector3();
        fittedBox.getSize(fittedSize);
        const fittedCenter = new THREE.Vector3();
        fittedBox.getCenter(fittedCenter);
        const fittedRadius = Math.max(fittedSize.x, fittedSize.y, fittedSize.z) * 0.5;
        const fov = (camera.fov * Math.PI) / 180;
        const distance = fittedRadius / Math.tan(fov / 2);
        camera.position.set(fittedCenter.x, fittedCenter.y + fittedRadius * 0.1, distance * 1.05);
        camera.lookAt(fittedCenter.x, fittedCenter.y + fittedRadius * 0.06, fittedCenter.z);
      },
      undefined,
      () => {
        // ignore errors gracefully
      },
    );

    function resize() {
      const w = mount.clientWidth || 400;
      const h = mount.clientHeight || 400;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }

    let rafId = null;
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      if (model) model.rotation.y += 0.0025;
      renderer.render(scene, camera);
    };

    resize();
    window.addEventListener('resize', resize);
    animate();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(rafId);
      if (model) {
        try {
          scene.remove(model);
          model.traverse((n) => {
            if (n.isMesh) {
              if (n.geometry) n.geometry.dispose();
              if (n.material) {
                const m = n.material;
                if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
                else m.dispose();
              }
            }
          });
        } catch (e) {}
      }
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, [src]);

  return <div ref={mountRef} className="entry-building-canvas" aria-hidden="true" />;
}
