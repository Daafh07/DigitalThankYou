'use client';

import { Text, useTexture } from '@react-three/drei';
import { Suspense } from 'react';
import * as THREE from 'three';

function LogoTexture({ logo }) {
  const texture = useTexture(logo);
  texture.colorSpace = THREE.SRGBColorSpace;

  return (
    <mesh position={[0, 0.02, 0.071]}>
      <planeGeometry args={[0.92, 0.32]} />
      <meshBasicMaterial map={texture} transparent toneMapped={false} />
    </mesh>
  );
}

export default function LogoLoader({ partner, scale = 1 }) {
  return (
    <group scale={scale}>
      <Suspense
        fallback={
          <Text
            position={[0, 0.02, 0.073]}
            fontSize={0.12}
            maxWidth={0.86}
            anchorX="center"
            anchorY="middle"
            color="#0a4f91"
          >
            {partner.name}
          </Text>
        }
      >
        <LogoTexture logo={partner.logo} />
      </Suspense>
    </group>
  );
}
