'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

const ceramicMaterial = new THREE.MeshStandardMaterial({
  color: '#fff8ee',
  roughness: 0.22,
  metalness: 0,
});

const blueMaterial = new THREE.MeshBasicMaterial({
  color: '#0a4f91',
});

const glowMaterial = new THREE.MeshBasicMaterial({
  color: '#d5a84d',
  transparent: true,
  opacity: 0.18,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});

export default function InteractiveTile({ insertionStarted, onInteract, onInserted }) {
  const groupRef = useRef(null);
  const glowRef = useRef(null);
  const hasInserted = useRef(false);
  const progress = useRef(0);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(onInteract, 900);
    return () => window.clearTimeout(timer);
  }, [onInteract]);

  useFrame(({ clock, pointer }, delta) => {
    if (!groupRef.current) return;

    if (!insertionStarted) {
      groupRef.current.position.x = THREE.MathUtils.damp(groupRef.current.position.x, pointer.x * 0.28, 4, delta);
      groupRef.current.position.y = THREE.MathUtils.damp(
        groupRef.current.position.y,
        pointer.y * 0.18 + Math.sin(clock.elapsedTime * 1.1) * 0.05,
        4,
        delta,
      );
      groupRef.current.position.z = 1.15;
      groupRef.current.rotation.x = THREE.MathUtils.damp(groupRef.current.rotation.x, pointer.y * -0.24, 4, delta);
      groupRef.current.rotation.y = THREE.MathUtils.damp(groupRef.current.rotation.y, pointer.x * 0.38, 4, delta);
    } else {
      progress.current = Math.min(1, progress.current + delta / 2.2);
      const eased = progress.current * progress.current * (3 - 2 * progress.current);
      groupRef.current.position.x = THREE.MathUtils.damp(groupRef.current.position.x, 0, 5, delta);
      groupRef.current.position.y = THREE.MathUtils.damp(groupRef.current.position.y, 0, 5, delta);
      groupRef.current.position.z = THREE.MathUtils.lerp(1.15, -0.54, eased);
      groupRef.current.rotation.x = THREE.MathUtils.damp(groupRef.current.rotation.x, 0, 4, delta);
      groupRef.current.rotation.y = THREE.MathUtils.damp(groupRef.current.rotation.y, 0, 4, delta);
      groupRef.current.scale.setScalar(THREE.MathUtils.lerp(1.12, 0.98, eased));

      if (progress.current >= 1 && !hasInserted.current) {
        hasInserted.current = true;
        onInserted();
      }
    }

    if (glowRef.current) {
      glowRef.current.material.opacity = THREE.MathUtils.damp(glowRef.current.material.opacity, hovered ? 0.34 : 0.16, 5, delta);
    }
  });

  return (
    <group
      ref={groupRef}
      position={[0, 0.1, 1.15]}
      scale={1.12}
      onPointerEnter={() => {
        setHovered(true);
        onInteract();
      }}
      onPointerMove={onInteract}
      onClick={onInteract}
      onPointerLeave={() => setHovered(false)}
    >
      <mesh ref={glowRef} position={[0, 0, -0.08]} material={glowMaterial}>
        <planeGeometry args={[1.35, 1.35]} />
      </mesh>
      <mesh material={ceramicMaterial}>
        <boxGeometry args={[0.92, 0.92, 0.14]} />
      </mesh>
      <mesh position={[0, 0.24, 0.078]} material={blueMaterial}>
        <boxGeometry args={[0.52, 0.035, 0.012]} />
      </mesh>
      <mesh position={[0, -0.24, 0.078]} material={blueMaterial}>
        <boxGeometry args={[0.52, 0.035, 0.012]} />
      </mesh>
      <mesh position={[-0.24, 0, 0.079]} rotation={[0, 0, Math.PI / 2]} material={blueMaterial}>
        <boxGeometry args={[0.52, 0.025, 0.012]} />
      </mesh>
      <mesh position={[0.24, 0, 0.079]} rotation={[0, 0, Math.PI / 2]} material={blueMaterial}>
        <boxGeometry args={[0.52, 0.025, 0.012]} />
      </mesh>
    </group>
  );
}
