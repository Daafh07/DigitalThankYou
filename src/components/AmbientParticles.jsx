'use client';

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

export default function AmbientParticles({ impactAt }) {
  const pointsRef = useRef(null);
  const materialRef = useRef(null);
  const geometry = useMemo(() => {
    const count = 160;
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * 10;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 6;
      positions[i * 3 + 2] = -1.8 + Math.random() * 4.5;
    }

    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return particleGeometry;
  }, []);

  useFrame(({ clock }) => {
    if (!pointsRef.current || !materialRef.current) return;
    pointsRef.current.rotation.y = Math.sin(clock.elapsedTime * 0.08) * 0.08;
    pointsRef.current.position.y = Math.sin(clock.elapsedTime * 0.12) * 0.05;

    const life = impactAt == null ? -1 : performance.now() / 1000 - impactAt;
    const pulse = life > 0 ? Math.exp(-life * 1.6) : 0;
    materialRef.current.opacity = 0.18 + pulse * 0.34;
    materialRef.current.size = 0.015 + pulse * 0.018;
  });

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        ref={materialRef}
        color="#e1c175"
        size={0.015}
        transparent
        opacity={0.18}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
