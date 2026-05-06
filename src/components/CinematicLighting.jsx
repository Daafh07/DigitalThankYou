'use client';

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';

export default function CinematicLighting({ inserted, impactAt }) {
  const goldRef = useRef(null);
  const sweepRef = useRef(null);

  useFrame(({ clock }) => {
    if (goldRef.current) {
      const life = impactAt == null ? -1 : performance.now() / 1000 - impactAt;
      const pulse = life > 0 ? Math.exp(-life * 1.35) : 0;
      goldRef.current.intensity = (inserted ? 3.2 : 1.4) + pulse * 8;
    }

    if (sweepRef.current) {
      sweepRef.current.position.x = Math.sin(clock.elapsedTime * 0.22) * 2.2;
      sweepRef.current.intensity = 1.7 + Math.sin(clock.elapsedTime * 0.33) * 0.35;
    }
  });

  return (
    <>
      <ambientLight intensity={0.24} color="#7893b4" />
      <directionalLight position={[-2.5, 2.8, 4]} intensity={2.2} color="#c7dbff" />
      <spotLight
        ref={sweepRef}
        position={[0, 3.4, 4.2]}
        angle={0.34}
        penumbra={0.82}
        intensity={1.7}
        color="#dbe9ff"
        castShadow={false}
      />
      <pointLight ref={goldRef} position={[0, 0, 1.15]} intensity={1.4} color="#d5a84d" distance={5.5} />
      <pointLight position={[-3.5, -1.8, 2.4]} intensity={0.9} color="#0a4f91" distance={7} />
    </>
  );
}
