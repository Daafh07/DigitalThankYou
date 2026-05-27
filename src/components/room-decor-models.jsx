'use client';

import { useEffect, useRef } from 'react';

const PILLAR_MODEL = '/assets/models/decor/pillar.glb';
const VASE_MODEL = '/assets/models/decor/vase.glb';
const WINDOW_SILL_MODEL = '/assets/models/decor/vensterbank.glb';
const GROOT_VAAS_RECHTS_MODEL = '/assets/models/decor/grootvaasrechts.glb';
const GROOT_COMBI_VAAS_LINKS_MODEL = '/assets/models/decor/grootcombivaaslinks.glb';

function normalizeModel(root, THREE, targetHeight) {
  const model = root.clone(true);

  model.traverse((node) => {
    if (!node.isMesh) return;
    node.frustumCulled = false;
    node.castShadow = false;
    node.receiveShadow = false;

    const materials = Array.isArray(node.material) ? node.material : [node.material];
    node.material = materials.map((material) => {
      const replacement = new THREE.MeshStandardMaterial({
        color: material?.color ?? new THREE.Color('#ffffff'),
        map: material?.map ?? null,
        normalMap: material?.normalMap ?? null,
        roughness: 0.62,
        metalness: 0,
        transparent: Boolean(material?.transparent),
        opacity: material?.opacity ?? 1,
        side: THREE.DoubleSide,
      });
      return replacement;
    });
    if (node.material.length === 1) node.material = node.material[0];
  });

  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());

  model.position.sub(center);
  if (size.y > 0) model.scale.setScalar(targetHeight / size.y);
  model.updateWorldMatrix(true, true);

  const fitted = new THREE.Box3().setFromObject(model);
  model.position.y -= fitted.min.y;
  return model;
}

function normalizeModelByWidth(root, THREE, targetWidth) {
  const model = normalizeModel(root, THREE, 1);
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());

  if (size.x > 0) {
    model.scale.multiplyScalar(targetWidth / size.x);
    model.updateWorldMatrix(true, true);
  }

  const fitted = new THREE.Box3().setFromObject(model);
  model.position.y -= fitted.min.y;
  return model;
}

function prepareVaseBend(vase, THREE) {
  vase.updateWorldMatrix(true, true);

  const bounds = new THREE.Box3().setFromObject(vase);
  const height = Math.max(0.001, bounds.max.y - bounds.min.y);
  const vaseInverse = new THREE.Matrix4().copy(vase.matrixWorld).invert();
  const temp = new THREE.Vector3();
  const meshes = [];

  vase.traverse((node) => {
    if (!node.isMesh || !node.geometry?.attributes?.position) return;

    node.geometry = node.geometry.clone();
    const position = node.geometry.attributes.position;
    const original = new Float32Array(position.array);
    const weights = new Float32Array(position.count);

    node.updateWorldMatrix(true, false);
    for (let i = 0; i < position.count; i++) {
      temp.fromBufferAttribute(position, i);
      node.localToWorld(temp);
      temp.applyMatrix4(vaseInverse);
      const normalizedY = THREE.MathUtils.clamp((temp.y - bounds.min.y) / height, 0, 1);
      weights[i] = normalizedY * normalizedY * normalizedY;
    }

    meshes.push({ node, position, original, weights });
  });

  return {
    amount: 0,
    set(amount) {
      if (Math.abs(this.amount - amount) < 0.0001) return;
      this.amount = amount;

      meshes.forEach(({ position, original, weights }) => {
        for (let i = 0; i < weights.length; i++) {
          const sourceIndex = i * 3;
          const weight = weights[i];
          position.array[sourceIndex] = original[sourceIndex] + amount * weight;
          position.array[sourceIndex + 1] = original[sourceIndex + 1];
          position.array[sourceIndex + 2] = original[sourceIndex + 2] + Math.abs(amount) * weight * 0.08;
        }
        position.needsUpdate = true;
      });
    },
  };
}


function clamp01(value) {
  return Math.min(Math.max(value, 0), 1);
}


function createVaseReveal(vasePivot, vase, THREE, spinDir = 1) {
  // Tijdlijn (9.5s totaal, zelfde ratio als de referentie HTML):
  // 0.00–0.76s  lichtbol flitst in (smallBuild 0→0.08)
  // 0.0 – 1.0s  lichtbol: stip → max
  // 1.0 – 3.0s  lichtbol vasthouden
  // 3.0 – 3.6s  lichtbol fadet weg
  // 3.6 – 7.0s  vaas spint in
  const DURATION   = 7.0;
  const SPIN_TOTAL = Math.PI * 4.0; // 2 omwentelingen, eindigt op zelfde positie

  function sm(edge0, edge1, x) {
    const t = clamp01((x - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
  }

  const setVaseOpacity = (o) => {
    vase.traverse((child) => {
      if (!child.isMesh) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((m) => { m.opacity = o; m.transparent = o < 0.999; m.needsUpdate = true; });
    });
  };

  vase.updateWorldMatrix(true, true);
  const vaseBounds = new THREE.Box3().setFromObject(vase);

  vasePivot.updateWorldMatrix(true, true);
  const worldCenter = vaseBounds.getCenter(new THREE.Vector3());
  const bolParent = vasePivot.parent;
  const parentInverse = new THREE.Matrix4().copy(bolParent.matrixWorld).invert();
  const bolLocalPos = worldCenter.clone().applyMatrix4(parentInverse);

  // Shader-lichtbol: exact dezelfde fragment shader als de referentie HTML
  const lightMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite:  false,
    depthTest:   true,
    blending:    THREE.AdditiveBlending,
    uniforms: {
      uTime:       { value: 0 },
      uIntensity:  { value: 0 },
      uRadius:     { value: 0.08 },
      uDistortion: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uTime;
      uniform float uIntensity;
      uniform float uRadius;
      uniform float uDistortion;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
      }

      void main() {
        vec2 uv = vUv * 2.0 - 1.0;
        float d = length(uv);
        float angle = atan(uv.y, uv.x);

        float wobble = noise(vec2(angle * 1.2, uTime * 0.5)) * uDistortion;
        float r = uRadius + wobble;

        float sphere = 1.0 - smoothstep(0.0, r, d);
        sphere = pow(sphere, 1.75);

        float haze = 1.0 - smoothstep(r * 0.35, r + 0.55, d);
        haze = pow(haze, 2.4);

        float alpha = (sphere * 1.35 + haze * 0.07) * uIntensity;
        vec3 color = mix(vec3(1.0, 0.95, 0.84), vec3(1.0), sphere);

        gl_FragColor = vec4(color, alpha);
      }
    `,
  });

  // Grote plane zodat de zachte haze-rand nooit afgeknipt wordt
  const lightPlane = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), lightMat);
  lightPlane.renderOrder   = -1;
  lightPlane.frustumCulled = false;
  lightPlane.position.set(bolLocalPos.x, bolLocalPos.y, bolLocalPos.z - 0.5);
  bolParent.add(lightPlane);

  vasePivot.scale.setScalar(0.001);
  vasePivot.rotation.y = 0;
  setVaseOpacity(0);

  const state = { startedAt: -1, visible: false, complete: false };

  const resetBol = () => {
    lightMat.uniforms.uIntensity.value  = 0;
    lightMat.uniforms.uRadius.value     = 0.08;
    lightMat.uniforms.uDistortion.value = 0;
    vasePivot.scale.setScalar(0.001);
    vasePivot.rotation.y = 0;
    setVaseOpacity(0);
  };

  return {
    state,
    start(now) {
      if (state.visible || state.complete) return;
      state.startedAt = now;
      state.visible   = true;
      resetBol();
    },
    reset() {
      state.startedAt = -1;
      state.visible   = false;
      state.complete  = false;
      resetBol();
    },
    update(now) {
      if (!state.visible && !state.complete) return;
      if (state.complete) return;

      const elapsed = now - state.startedAt;
      const t = clamp01(elapsed / DURATION);

      // Bol: 0→0.6s rustig infaden klein, dan direct groeien 0.6–1.6s, 4.0–5.0s uit
      const bolAppear = sm(0.0 / DURATION, 0.6 / DURATION, t);
      const bolGrow   = sm(0.6 / DURATION, 1.6 / DURATION, t);
      const bolHold   = 1.0 - sm(4.0 / DURATION, 5.0 / DURATION, t);
      const lightAmount = bolAppear * bolHold * 0.7;
      // Iets groter op max: 0.003 + 0.025 + 0.26 = 0.288
      const radius = 0.003 + bolAppear * 0.025 + bolGrow * 0.26;

      lightMat.uniforms.uTime.value       = elapsed;
      lightMat.uniforms.uIntensity.value  = lightAmount;
      lightMat.uniforms.uRadius.value     = radius;
      lightMat.uniforms.uDistortion.value = 0.001 + bolGrow * 0.004;

      // Vaas start op 1.6s (als bol zijn max bereikt), bol pas weg op 4.0s
      const vaseSpin      = sm(1.6 / DURATION, 7.0 / DURATION, t);
      const revealOpacity = sm(1.6 / DURATION, 4.5 / DURATION, t);
      setVaseOpacity(revealOpacity);

      const scale = 0.001 + (1 - (1 - vaseSpin) ** 3) * 0.999;
      vasePivot.scale.setScalar(Math.max(0.001, scale));
      vasePivot.rotation.y = vaseSpin * SPIN_TOTAL * spinDir;

      if (t >= 1) {
        state.complete = true;
        lightMat.uniforms.uIntensity.value = 0;
        vasePivot.scale.setScalar(1);
        vasePivot.rotation.y = SPIN_TOTAL * spinDir;
        setVaseOpacity(1);
      }
    },
  };
}

export default function RoomDecorModels({
  active = false,
  visible = false,
  vasesVisible = false,
  impactSignal = 0,
  onReady,
} = {}) {
  const hostRef = useRef(null);
  const impactSignalRef = useRef(impactSignal);
  const visibleRef = useRef(visible);
  const vasesVisibleRef = useRef(vasesVisible);
  const pointerRef = useRef({ x: -10000, y: -10000, active: false });

  useEffect(() => {
    impactSignalRef.current = impactSignal;
  }, [impactSignal]);

  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  useEffect(() => {
    vasesVisibleRef.current = vasesVisible;
  }, [vasesVisible]);



  useEffect(() => {
    if (!active) return undefined;

    const host = hostRef.current;
    if (!host) return undefined;

    let THREE = null;
    let renderer = null;
    let camera = null;
    let scene = null;
    let frameId = 0;
    let disposed = false;
    let cleanupResize = null;
    let cleanupPointer = null;
    let lastImpactSignal = impactSignalRef.current;
    let impactStartedAt = -1;
    const decorObjects = [];
    const vaseBenders = [];
    const swayObjects = [];

    const disposeObject = (object) => {
      object.traverse((node) => {
        node.geometry?.dispose();
        if (!node.material) return;
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        materials.forEach((material) => {
          Object.values(material).forEach((value) => { if (value?.isTexture) value.dispose(); });
          material.dispose();
        });
      });
    };

    const init = async () => {
      const [threeNS, { GLTFLoader }] = await Promise.all([
        import('three'),
        import('three/examples/jsm/loaders/GLTFLoader.js'),
      ]);
      if (disposed) return;

      THREE = threeNS;
      scene = new THREE.Scene();

      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        premultipliedAlpha: false,
        powerPreference: 'high-performance',
      });
      renderer.setClearColor(0x000000, 0);
      renderer.autoClear = true;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.localClippingEnabled = true;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      host.appendChild(renderer.domElement);

      camera = new THREE.OrthographicCamera(-8, 8, 5, -5, 0.1, 50);
      camera.position.set(0, 0, 10);
      camera.lookAt(0, 0, 0);

      scene.add(new THREE.HemisphereLight(0xf8fbff, 0xb8d2ff, 2.1));

      const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
      keyLight.position.set(-3.5, 5, 5);
      scene.add(keyLight);

      const fillLight = new THREE.DirectionalLight(0x9fc0ff, 1.45);
      fillLight.position.set(4, 2.5, 4);
      scene.add(fillLight);


      const loader = new GLTFLoader();
      const [pillarGltf, vaseGltf, windowSillGltf, grootVaasRechtsGltf, grootCombiVaasLinksGltf] = await Promise.all([
        loader.loadAsync(PILLAR_MODEL),
        loader.loadAsync(VASE_MODEL),
        loader.loadAsync(WINDOW_SILL_MODEL),
        loader.loadAsync(GROOT_VAAS_RECHTS_MODEL),
        loader.loadAsync(GROOT_COMBI_VAAS_LINKS_MODEL),
      ]);
      if (disposed) return;

      const sillObjects = [];
      const createWindowSill = ({ x, y, rotationY, rotationZ = 0, width = 2.45, stretchX = 1, shakeDir = 1, shakeDelay = 0 }) => {
        const sill = normalizeModelByWidth(windowSillGltf.scene, THREE, width);
        if (stretchX !== 1) sill.scale.x *= stretchX;
        sill.position.set(x, y, -0.12);
        sill.rotation.set(0.08, rotationY, rotationZ);
        sill.renderOrder = 1;
        scene.add(sill);
        decorObjects.push(sill);
        sillObjects.push({ sill, baseRotX: 0.08, baseRotY: rotationY, shakeDir, shakeDelay });
      };

      createWindowSill({ x: -6.9, y: -2.9, rotationY: 1.21, width: 3.5, stretchX: 1.35, shakeDir: -1, shakeDelay: 0.1 });
      createWindowSill({ x: 6.8, y: -2.9, rotationY: -1.19, width: 3.5, shakeDir: 1, shakeDelay: 0.15 });

      // grootvaasrechts op de rechter vensterbank, aan het uiteinde aan de voorkant
      const grootVaasRechts = normalizeModel(grootVaasRechtsGltf.scene, THREE, 2.4);
      grootVaasRechts.position.set(6.8, -0.7, 0.8);
      grootVaasRechts.rotation.set(0.08, -1.19, 0);
      grootVaasRechts.renderOrder = 2;
      scene.add(grootVaasRechts);
      decorObjects.push(grootVaasRechts);
      swayObjects.push({ bender: prepareVaseBend(grootVaasRechts, THREE), direction: 1, delay: 0.35, anchor: grootVaasRechts, hover: 0 });

      // grootcombivaaslinks op de linker vensterbank, aan het uiteinde aan de voorkant
      const grootCombiVaasLinks = normalizeModel(grootCombiVaasLinksGltf.scene, THREE, 2.4);
      grootCombiVaasLinks.position.set(-6.9, -0.7, 0.8);
      grootCombiVaasLinks.rotation.set(0.08, -0.5, 0);
      grootCombiVaasLinks.renderOrder = 2;
      scene.add(grootCombiVaasLinks);
      decorObjects.push(grootCombiVaasLinks);
      swayObjects.push({ bender: prepareVaseBend(grootCombiVaasLinks, THREE), direction: -1, delay: 0.5, anchor: grootCombiVaasLinks, hover: 0 });

      const createDecorSet = ({ x, y, rotationY, scale = 1 }) => {
        const group = new THREE.Group();
        const pillar = normalizeModel(pillarGltf.scene, THREE, 1.9 * scale);
        const vase = normalizeModel(vaseGltf.scene, THREE, 2.65 * scale);
        const vasePivot = new THREE.Group();

        pillar.position.set(0, 0, 0);
        vase.position.set(0, 0, 0);
        const vaseBender = prepareVaseBend(vase, THREE);
        vasePivot.position.set(0, 2.26 * scale, 0.04);
        vasePivot.add(vase);

        group.add(pillar, vasePivot);
        group.position.set(x, y, 0);
        group.rotation.y = rotationY;
        group.rotation.x = 0.1;
        scene.add(group);
        group.updateWorldMatrix(true, true);

        vaseBender.anchor = vasePivot;
        vaseBender.hover = 0;
        vaseBender.reveal = createVaseReveal(vasePivot, vase, THREE, x < 0 ? 1 : -1);
        vaseBender.impactDirection = x < 0 ? -1 : 1;
        vaseBender.impactDelay = 0.22 + Math.abs(x) * 0.035;
        decorObjects.push(group);
        vaseBenders.push(vaseBender);
      };

      createDecorSet({ x: -4.92, y: -2.25, rotationY: 0.08, scale: 1.18 });
      createDecorSet({ x: 4.92, y: -2.25, rotationY: -0.08, scale: 1.18 });

      const handlePointerMove = (event) => {
        pointerRef.current.x = event.clientX;
        pointerRef.current.y = event.clientY;
        pointerRef.current.active = true;
      };

      const handlePointerLeave = () => {
        pointerRef.current.active = false;
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerleave', handlePointerLeave);
      cleanupPointer = () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerleave', handlePointerLeave);
      };

      const resize = () => {
        const width = Math.max(1, host.clientWidth);
        const height = Math.max(1, host.clientHeight);
        renderer.setSize(width, height, false);

        const baseAspect = 16 / 10;
        const aspect = width / height;
        if (aspect >= baseAspect) {
          camera.left = -8 * (aspect / baseAspect);
          camera.right = 8 * (aspect / baseAspect);
          camera.top = 5;
          camera.bottom = -5;
        } else {
          camera.left = -8;
          camera.right = 8;
          camera.top = 5 * (baseAspect / aspect);
          camera.bottom = -5 * (baseAspect / aspect);
        }
        camera.updateProjectionMatrix();
      };

      const animate = () => {
        if (disposed) return;
        const now = performance.now() * 0.001;
        if (impactSignalRef.current !== lastImpactSignal) {
          lastImpactSignal = impactSignalRef.current;
          impactStartedAt = now;
        }

        const impactAge = impactStartedAt < 0 ? Infinity : now - impactStartedAt;
        const pointer = pointerRef.current;
        const rect = host.getBoundingClientRect();
        const projected = new THREE.Vector3();

        vaseBenders.forEach((bender) => {
          const localAge = impactAge - (bender.impactDelay || 0);
          const sway = localAge > 0 && localAge < 6.0
            ? Math.sin(localAge * 7.2) * Math.exp(-localAge * 0.65) * 0.032
            : 0;
          const direction = bender.impactDirection || 1;

          let hoverTarget = 0;
          if (impactSignalRef.current > 0 && visibleRef.current && pointer.active && rect.width > 0 && rect.height > 0 && bender.anchor) {
            bender.anchor.getWorldPosition(projected);
            projected.y += 0.95;
            projected.project(camera);
            const screenX = rect.left + (projected.x * 0.5 + 0.5) * rect.width;
            const screenY = rect.top + (-projected.y * 0.5 + 0.5) * rect.height;
            const distance = Math.hypot(pointer.x - screenX, pointer.y - screenY);
            hoverTarget = Math.max(0, 1 - distance / 145);
          }

          bender.hover += (hoverTarget - bender.hover) * 0.12;
          const hoverSway = Math.sin(now * 4.8) * bender.hover * 0.055;
          bender.set(direction * (sway * 8.2 + hoverSway));

          if (vasesVisibleRef.current) {
            bender.reveal.start(now);
            bender.reveal.update(now);
          } else {
            bender.reveal.reset();
          }
        });

        sillObjects.forEach(({ sill, baseRotX, baseRotY, shakeDir, shakeDelay }) => {
          const localAge = impactAge - shakeDelay;
          const shake = localAge > 0 && localAge < 1.2
            ? Math.sin(localAge * 38) * Math.exp(-localAge * 5.5) * 0.006
            : 0;
          sill.rotation.x = baseRotX + shake;
          sill.rotation.y = baseRotY + shakeDir * shake * 0.5;
        });

        swayObjects.forEach((entry) => {
          const { bender, direction, delay, anchor } = entry;
          const localAge = impactAge - delay;
          const sway = localAge > 0 && localAge < 6.0
            ? Math.sin(localAge * 6.5) * Math.exp(-localAge * 0.7) * 0.04
            : 0;

          let hoverTarget = 0;
          if (impactSignalRef.current > 0 && visibleRef.current && pointer.active && rect.width > 0 && rect.height > 0 && anchor) {
            anchor.getWorldPosition(projected);
            projected.y += 0.95;
            projected.project(camera);
            const screenX = rect.left + (projected.x * 0.5 + 0.5) * rect.width;
            const screenY = rect.top + (-projected.y * 0.5 + 0.5) * rect.height;
            const distance = Math.hypot(pointer.x - screenX, pointer.y - screenY);
            hoverTarget = Math.max(0, 1 - distance / 145);
          }

          entry.hover += (hoverTarget - entry.hover) * 0.12;
          const hoverSway = Math.sin(now * 4.8) * entry.hover * 0.055;
          bender.set(direction * (sway * 8.2 + hoverSway));
        });



        renderer.render(scene, camera);
        frameId = window.requestAnimationFrame(animate);
      };

      resize();
      renderer.render(scene, camera);
      onReady?.();
      window.addEventListener('resize', resize);
      cleanupResize = () => window.removeEventListener('resize', resize);
      frameId = window.requestAnimationFrame(animate);
    };

    init();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frameId);
      cleanupResize?.();
      cleanupPointer?.();
      decorObjects.forEach(disposeObject);
      renderer?.dispose();
      if (renderer?.domElement && host.contains(renderer.domElement)) {
        host.removeChild(renderer.domElement);
      }
    };
  }, [active, onReady]);

  return (
    <div
      ref={hostRef}
      className={`room-decor-models${visible ? ' room-decor-models-visible' : ''}`}
      aria-hidden="true"
    />
  );
}
