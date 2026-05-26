"use client";

/**
 * TilePreview3D — interactieve 3D-tegelpreview.
 * Met logo: voorvlak uit emptytile.svg + Delft-blauw logo.
 */

import { OrbitControls } from "@react-three/drei";
import { Canvas, useLoader, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import {
  createEmptyTileFrontTexture,
  createTileFrontTextureFromDataUrl,
  createTileFrontTextureWithLogo,
} from "@/lib/tile-front-composite";
import {
  createTileBackTexture,
  createTileFrontTexture,
} from "@/lib/tile-preview-textures";

const TILE_DEPTH = 0.1;
const TILE_ASPECT = 79 / 82;
const CERAMIC_EDGE_TEXTURE = "/assets/textures/keramiek.jpg";
const PLACEHOLDER_COLOR = "#fff8ee";

/**
 * @param {{
 *   frontText?: string;
 *   logoBlueDataUrl?: string | null;
 *   tileFrontDataUrl?: string | null;
 *   backYear?: string | null;
 *   isGenerating?: boolean;
 * }} props
 */
function TilePreviewMesh({
  frontText = "",
  logoBlueDataUrl = null,
  tileFrontDataUrl = null,
  backYear = null,
  isGenerating = false,
  showEmptyTile = false,
}) {
  const { gl } = useThree();
  const [composedFrontMap, setComposedFrontMap] = useState(
    /** @type {THREE.CanvasTexture | null} */ (null),
  );
  const [emptyFrontMap, setEmptyFrontMap] = useState(
    /** @type {THREE.CanvasTexture | null} */ (null),
  );

  const sideMap = useLoader(THREE.TextureLoader, CERAMIC_EDGE_TEXTURE);
  const useComposedFront = Boolean(tileFrontDataUrl || logoBlueDataUrl);
  const useEmptyTile =
    showEmptyTile && !useComposedFront && !frontText.trim();

  const textFrontMap = useMemo(
    () => (useComposedFront ? null : createTileFrontTexture(frontText, gl)),
    [frontText, gl, useComposedFront],
  );
  const backMap = useMemo(
    () => createTileBackTexture(gl, { year: backYear ?? undefined }),
    [gl, backYear],
  );

  const placeholderMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: PLACEHOLDER_COLOR,
        toneMapped: false,
      }),
    [],
  );

  useEffect(() => {
    if (!useComposedFront) {
      setComposedFrontMap(null);
      return undefined;
    }

    let cancelled = false;
    let texture = /** @type {THREE.CanvasTexture | null} */ (null);

    const loader = tileFrontDataUrl
      ? createTileFrontTextureFromDataUrl(tileFrontDataUrl, gl)
      : createTileFrontTextureWithLogo(logoBlueDataUrl, gl);

    loader
      .then((map) => {
        if (cancelled) {
          map.dispose();
          return;
        }
        texture = map;
        setComposedFrontMap(map);
      })
      .catch(() => {
        if (!cancelled) setComposedFrontMap(null);
      });

    return () => {
      cancelled = true;
      texture?.dispose();
    };
  }, [tileFrontDataUrl, logoBlueDataUrl, gl, useComposedFront]);

  useEffect(() => {
    if (!useEmptyTile) {
      setEmptyFrontMap(null);
      return undefined;
    }

    let cancelled = false;
    let texture = /** @type {THREE.CanvasTexture | null} */ (null);

    createEmptyTileFrontTexture(gl)
      .then((map) => {
        if (cancelled) {
          map.dispose();
          return;
        }
        texture = map;
        setEmptyFrontMap(map);
      })
      .catch(() => {
        if (!cancelled) setEmptyFrontMap(null);
      });

    return () => {
      cancelled = true;
      texture?.dispose();
    };
  }, [useEmptyTile, gl]);

  const frontMap = useComposedFront
    ? composedFrontMap
    : useEmptyTile
      ? emptyFrontMap
      : textFrontMap;

  useEffect(() => {
    configureSide(sideMap, gl);
  }, [sideMap, gl]);

  useEffect(
    () => () => {
      textFrontMap?.dispose();
      composedFrontMap?.dispose();
      emptyFrontMap?.dispose();
      backMap.dispose();
    },
    [textFrontMap, composedFrontMap, emptyFrontMap, backMap],
  );

  const sideMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#ffffff",
        map: sideMap,
        toneMapped: false,
      }),
    [sideMap],
  );

  const frontMaterial = useMemo(() => {
    if (!frontMap) return placeholderMaterial;
    return new THREE.MeshBasicMaterial({
      color: "#ffffff",
      map: frontMap,
      toneMapped: false,
    });
  }, [frontMap, placeholderMaterial]);

  const backMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#ffffff",
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
        enableZoom
        minDistance={1.4}
        maxDistance={4}
        autoRotate={isGenerating || (useComposedFront && !composedFrontMap) || (useEmptyTile && !emptyFrontMap)}
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
 * @param {{
 *   frontText?: string;
 *   logoBlueDataUrl?: string | null;
 *   tileFrontDataUrl?: string | null;
 *   backYear?: string | null;
 *   isGenerating?: boolean;
 *   className?: string;
 *   canvasClassName?: string;
 * }} props
 */
export default function TilePreview3D({
  frontText = "",
  logoBlueDataUrl = null,
  tileFrontDataUrl = null,
  backYear = null,
  isGenerating = false,
  showEmptyTile = false,
  variant = "dark",
  className = "",
  canvasClassName = "",
}) {
  const isLight = variant === "light";
  const shellClass = isLight
    ? "relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
    : "relative overflow-hidden rounded-xl border border-white/10 bg-[#0a1628]/60";
  const defaultCanvasClass = isLight ? "h-[220px] w-full" : "h-[200px] w-full";

  return (
    <div className={[shellClass, className].filter(Boolean).join(" ")}>
      <div
        className={
          canvasClassName
            ? ["w-full", canvasClassName].join(" ")
            : defaultCanvasClass
        }
      >
        <Canvas
          camera={{ position: [0, 0, 2.35], fov: 42, near: 0.1, far: 100 }}
          gl={{ alpha: true, antialias: true }}
          style={{ background: "transparent" }}
        >
          <Suspense fallback={null}>
            <TilePreviewMesh
              frontText={frontText}
              logoBlueDataUrl={logoBlueDataUrl}
              tileFrontDataUrl={tileFrontDataUrl}
              backYear={backYear}
              isGenerating={isGenerating}
              showEmptyTile={showEmptyTile}
            />
          </Suspense>
        </Canvas>
      </div>

      <div
        className={[
          "pointer-events-none absolute inset-x-0 bottom-0 px-3 pb-2.5 pt-6",
          isLight
            ? "bg-gradient-to-t from-white via-white/80 to-transparent"
            : "bg-gradient-to-t from-[#0a1628]/90 to-transparent",
        ].join(" ")}
      >
        <p
          className={[
            "text-center text-[10px] tracking-wide",
            isLight ? "text-slate-400" : "text-white/45",
          ].join(" ")}
        >
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
