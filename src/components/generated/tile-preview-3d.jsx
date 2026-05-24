'use client';

/**
 * TilePreview3D — interactieve 3D-tegelpreview tijdens en na AI-generatie.
 * Voorkant: ingevoerde tekst. Achterkant: standaard bedankteksten.
 */

import { OrbitControls } from '@react-three/drei';
import { Canvas, useLoader, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import {
  createTileBackTexture,
  createTileFrontTexture,
} from '@/lib/tile-preview-textures';

const TILE_DEPTH = 0.1;
const TILE_ASPECT = 79 / 82;
const CERAMIC_EDGE_TEXTURE = '/assets/textures/keramiek.jpg';

/**
 * @param {{ frontText: string; isGenerating?: boolean }} props
 */
function TilePreviewMesh({ frontText, isGenerating = false }) {
  const { gl } = useThree();

  const sideMap = useLoader(THREE.TextureLoader, CERAMIC_EDGE_TEXTURE);
  const frontMap = useMemo(
    () => createTileFrontTexture(frontText, gl),
    [frontText, gl],
  );
  const backMap = useMemo(() => createTileBackTexture(gl), [gl]);

  useEffect(() => {
    configureSide(sideMap, gl);
  }, [sideMap, gl]);

  useEffect(
    () => () => {
      frontMap.dispose();
      backMap.dispose();
    },
    [frontMap, backMap],
  );

  const sideMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#ffffff',
        map: sideMap,
        toneMapped: false,
      }),
    [sideMap],
  );

  const frontMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#ffffff',
        map: frontMap,
        toneMapped: false,
      }),
    [frontMap],
  );

  const backMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#ffffff',
        map: backMap,
        toneMapped: false,
      }),
    [backMap],
  );

  const materials = useMemo(
    () => [
      sideMaterial,
      sideMaterial,
      sideMaterial,
      sideMaterial,
      frontMaterial,
      backMaterial,
    ],
    [sideMaterial, frontMaterial, backMaterial],
  );

  return (
    <>
      <mesh scale={[TILE_ASPECT, 1, 1]} material={materials}>
        <boxGeometry args={[1, 1, TILE_DEPTH]} />
      </mesh>
      <OrbitControls
        enablePan={false}
        enableZoom={false}
        autoRotate={isGenerating}
        autoRotateSpeed={1.4}
        minPolarAngle={Math.PI * 0.22}
        maxPolarAngle={Math.PI * 0.78}
        rotateSpeed={0.85}
        dampingFactor={0.08}
        enableDamping
      />
    </>
  );
}

/**
 * @param {THREE.Texture} texture
 * @param {THREE.WebGLRenderer} renderer
 */
function configureSide(texture, renderer) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
}

/**
 * @param {{ frontText: string; isGenerating?: boolean; className?: string }} props
 */
export default function TilePreview3D({
  frontText,
  isGenerating = false,
  className = '',
}) {
  return (
    <div
      className={[
        'relative overflow-hidden rounded-xl border border-white/10 bg-[#0a1628]/60',
        className,
      ].join(' ')}
    >
      <div className="h-[200px] w-full">
        <Canvas
          camera={{ position: [0, 0, 2.35], fov: 42 }}
          gl={{ alpha: true, antialias: true }}
          style={{ background: 'transparent' }}
        >
          <Suspense fallback={null}>
            <TilePreviewMesh
              frontText={frontText}
              isGenerating={isGenerating}
            />
          </Suspense>
        </Canvas>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0a1628]/90 to-transparent px-3 pb-2.5 pt-6">
        <p className="text-center text-[10px] tracking-wide text-white/45">
          Sleep om de tegel te draaien
        </p>
      </div>

      {isGenerating && (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/25"
          aria-hidden
        >
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-blue-400" />
        </div>
      )}
    </div>
  );
}
