'use client';

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

const tileMaterial = new THREE.MeshStandardMaterial({
  color: '#f4f1e8',
  roughness: 0.28,
  metalness: 0,
});

const inkMaterial = new THREE.MeshBasicMaterial({
  color: '#0a4f91',
  transparent: true,
  opacity: 0.82,
});

const goldMaterial = new THREE.MeshBasicMaterial({
  color: '#d5a84d',
  transparent: true,
  opacity: 0.12,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});

export default function TileWall({ inserted, impactAt }) {
  const tileRef = useRef(null);
  const inkRef = useRef(null);
  const seamRef = useRef(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const grid = useMemo(() => ({ cols: 9, rows: 5, gap: 0.78, count: 45 }), []);
  const tileData = useMemo(
    () =>
      Array.from({ length: grid.count }, (_, index) => {
        const x = (index % grid.cols - (grid.cols - 1) / 2) * grid.gap;
        const y = (Math.floor(index / grid.cols) - (grid.rows - 1) / 2) * -grid.gap;
        return {
          x,
          y,
          distance: Math.sqrt(x * x + y * y),
          phase: index * 0.73,
          isCenter: Math.abs(x) < 0.05 && Math.abs(y) < 0.05,
        };
      }),
    [grid],
  );

  useFrame(({ clock, pointer }) => {
    const now = performance.now() / 1000;
    const life = impactAt == null ? -1 : now - impactAt;

    tileData.forEach((tile, index) => {
      const wave = life > 0 ? Math.max(0, 1 - Math.abs(life * 2.2 - tile.distance) * 1.55) : 0;
      const dampedWave = wave * Math.exp(Math.max(0, life) * -1.15);
      const idle = Math.sin(clock.elapsedTime * 0.8 + tile.phase) * 0.018;
      const pointerLift = (pointer.x * tile.x + pointer.y * tile.y) * 0.01;
      const centerLift = inserted && tile.isCenter ? 0.06 : 0;
      const z = dampedWave * 0.42 + idle + pointerLift + centerLift;

      dummy.position.set(tile.x, tile.y, z);
      dummy.rotation.set(pointer.y * 0.01, -pointer.x * 0.01, 0);
      dummy.scale.setScalar(tile.isCenter && inserted ? 1.03 : 1);
      dummy.updateMatrix();
      tileRef.current?.setMatrixAt(index, dummy.matrix);

      dummy.position.set(tile.x, tile.y, z + 0.052);
      dummy.rotation.set(0, 0, index % 2 === 0 ? Math.PI / 4 : -Math.PI / 4);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      inkRef.current?.setMatrixAt(index, dummy.matrix);
    });

    if (tileRef.current) tileRef.current.instanceMatrix.needsUpdate = true;
    if (inkRef.current) inkRef.current.instanceMatrix.needsUpdate = true;

    if (seamRef.current) {
      const pulse = life > 0 ? Math.exp(-life * 1.8) : 0;
      seamRef.current.material.opacity = 0.08 + pulse * 0.2;
    }
  });

  return (
    <group position={[0, 0, -0.62]}>
      <mesh ref={seamRef} position={[0, 0, -0.055]} material={goldMaterial}>
        <planeGeometry args={[7.3, 4.1]} />
      </mesh>

      <instancedMesh ref={tileRef} args={[undefined, undefined, grid.count]} material={tileMaterial}>
        <boxGeometry args={[0.7, 0.7, 0.07]} />
      </instancedMesh>

      <instancedMesh ref={inkRef} args={[undefined, undefined, grid.count]} material={inkMaterial}>
        <boxGeometry args={[0.34, 0.018, 0.01]} />
      </instancedMesh>
    </group>
  );
}
