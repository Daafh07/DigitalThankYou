'use client';

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';

export default function ShockwaveAnimation({ impactAt }) {
  const ringRef = useRef(null);
  const materialRef = useRef(null);

  useFrame(() => {
    if (!ringRef.current || !materialRef.current || impactAt == null) return;
    const life = performance.now() / 1000 - impactAt;
    if (life < 0 || life > 2.7) {
      materialRef.current.opacity = 0;
      return;
    }

    const radius = 0.18 + life * 2.25;
    ringRef.current.scale.setScalar(radius);
    materialRef.current.opacity = Math.max(0, 0.34 * (1 - life / 2.7));
  });

  return (
    <mesh ref={ringRef} position={[0, 0, -0.48]}>
      <torusGeometry args={[1, 0.01, 8, 64]} />
      <meshBasicMaterial
        ref={materialRef}
        color="#d5a84d"
        transparent
        opacity={0}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}
