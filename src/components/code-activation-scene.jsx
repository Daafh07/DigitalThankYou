"use client";
import { useEffect, useRef, useCallback, useState } from "react";

const VALID_CODE = "12345";

function CodeInput({ onCorrect }) {
  const [values, setValues] = useState(["", "", "", "", ""]);
  const [error, setError] = useState(false);
  const inputRefs = useRef([]);

  const handleChange = (index, e) => {
    const val = e.target.value.replace(/\D/, "").slice(-1);
    const next = [...values];
    next[index] = val;
    setValues(next);
    setError(false);

    if (val && index < 4) inputRefs.current[index + 1]?.focus();

    const code = next.join("");
    if (code.length === 5) {
      if (code === VALID_CODE) {
        onCorrect();
      } else {
        setError(true);
        setTimeout(() => {
          setValues(["", "", "", "", ""]);
          setError(false);
          inputRefs.current[0]?.focus();
        }, 800);
      }
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace" && !values[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  return (
    <div className="code-input-wrapper">
      <div className="code-input-text">
      <p className="code-input-label">Fill in your unique code</p>
      <p className="code-input-subtext">
        Find your unique code on the back of your physical tile.
      </p>{" "}
      </div>
      <div className="code-input-fields">
        {values.map((val, i) => (
          <input
            key={i}
            ref={(el) => (inputRefs.current[i] = el)}
            className={`code-input-field${error ? " code-input-field-error" : ""}`}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={val}
            onChange={(e) => handleChange(i, e)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            autoFocus={i === 0}
          />
        ))}
      </div>
      {error && (
        <p className="code-input-error">Ongeldige code, probeer opnieuw</p>
      )}
    </div>
  );
}

function DoorModel({ onReady, shouldOpen, onOpenComplete }) {
  const hostRef = useRef(null);
  const doorRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    async function init() {
      const THREE = await import("three");
      const { GLTFLoader } =
        await import("three/examples/jsm/loaders/GLTFLoader.js");

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
      });
      renderer.setSize(host.clientWidth, host.clientHeight);
      host.appendChild(renderer.domElement);

      const camera = new THREE.PerspectiveCamera(
        32,
        host.clientWidth / host.clientHeight,
        0.1,
        100,
      );
      camera.position.set(0, 0.55, 5.4);

      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xffffff, 0xd8e7ff, 2.25));

      const gltf = await new GLTFLoader().loadAsync(
        "/assets/models/decor/deurCodeScene.glb",
      );

      const door = gltf.scene;

      const box = new THREE.Box3().setFromObject(door);
      const width = box.getSize(new THREE.Vector3()).x;
      door.position.x = width / 2;

      const pivot = new THREE.Group();
      pivot.position.set(1.1, 0.27, 0);
      pivot.scale.set(0.9, 0.975, 1);
      pivot.add(door);
      scene.add(pivot);

      doorRef.current = pivot;

      let looping = true;
      const animate = () => {
        if (!looping) return;
        requestAnimationFrame(animate);
        renderer.render(scene, camera);
      };
      animate();

      onReady?.();

      return () => {
        looping = false;
      };
    }

    let cleanup = null;
    init().then((fn) => {
      cleanup = fn;
    });

    return () => {
      cleanup?.();
    };
  }, [onReady]);

  useEffect(() => {
    if (!shouldOpen) return;

    const target = -Math.PI / 2;
    let done = false;

    const open = () => {
      if (done) return;
      if (!doorRef.current) {
        requestAnimationFrame(open);
        return;
      }
      const diff = target - doorRef.current.rotation.y;
      if (Math.abs(diff) < 0.01) {
        doorRef.current.rotation.y = target;
        done = true;
        setTimeout(() => onOpenComplete?.(), 800);
        return;
      }
      doorRef.current.rotation.y += diff * 0.05;
      requestAnimationFrame(open);
    };

    open();
  }, [shouldOpen, onOpenComplete]);

  return <div ref={hostRef} className="code-activation-scene-door" />;
}

export default function CodeActivationScene({ onComplete }) {
  const [doorShouldOpen, setDoorShouldOpen] = useState(false);
  const [codeAccepted, setCodeAccepted] = useState(false);

  const handleDoorReady = useCallback(() => {}, []);
  const handleCorrectCode = useCallback(() => {
    setCodeAccepted(true);
    setDoorShouldOpen(true);
  }, []);

  return (
    <div className="code-activation-scene-frame">
      <img
        className="code-activation-scene-bg"
        src="/assets/figma/codeActivationBg.png"
        alt=""
      />
      {!codeAccepted && <CodeInput onCorrect={handleCorrectCode} />}
      <DoorModel
        onReady={handleDoorReady}
        shouldOpen={doorShouldOpen}
        onOpenComplete={onComplete}
      />
    </div>
  );
}
