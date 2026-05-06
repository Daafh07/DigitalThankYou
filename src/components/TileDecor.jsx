'use client';

import { createBlueInkMaterial } from './materials';

const ink = createBlueInkMaterial();
const softInk = createBlueInkMaterial({ opacity: 0.68 });

export default function TileDecor({ style = 'classic' }) {
  const floral = style === 'floral';
  const crest = style === 'crest';

  return (
    <group position={[0, 0, 0.072]}>
      <mesh position={[0, 0.54, 0]} material={softInk}>
        <torusGeometry args={[0.22, 0.006, 8, 64]} />
      </mesh>
      <mesh position={[0, -0.54, 0]} material={softInk}>
        <torusGeometry args={[0.22, 0.006, 8, 64]} />
      </mesh>
      <mesh position={[-0.52, 0.33, 0]} rotation={[0, 0, Math.PI / 4]} material={ink}>
        <boxGeometry args={[0.22, 0.012, 0.006]} />
      </mesh>
      <mesh position={[0.52, 0.33, 0]} rotation={[0, 0, -Math.PI / 4]} material={ink}>
        <boxGeometry args={[0.22, 0.012, 0.006]} />
      </mesh>
      <mesh position={[-0.52, -0.33, 0]} rotation={[0, 0, -Math.PI / 4]} material={ink}>
        <boxGeometry args={[0.22, 0.012, 0.006]} />
      </mesh>
      <mesh position={[0.52, -0.33, 0]} rotation={[0, 0, Math.PI / 4]} material={ink}>
        <boxGeometry args={[0.22, 0.012, 0.006]} />
      </mesh>

      {floral && (
        <>
          <mesh position={[-0.28, -0.05, 0]} material={softInk}>
            <torusGeometry args={[0.07, 0.004, 8, 32]} />
          </mesh>
          <mesh position={[0.28, -0.05, 0]} material={softInk}>
            <torusGeometry args={[0.07, 0.004, 8, 32]} />
          </mesh>
        </>
      )}

      {crest && (
        <mesh position={[0, -0.08, 0]} rotation={[0, 0, Math.PI / 4]} material={softInk}>
          <boxGeometry args={[0.18, 0.18, 0.006]} />
        </mesh>
      )}
    </group>
  );
}
