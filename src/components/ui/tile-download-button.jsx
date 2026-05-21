"use client";

import { useCallback, useEffect, useState } from "react";
import * as THREE from "three";
import { downloadTileAsGlb } from "../../lib/download-tile";

import { Download } from "lucide-react";
import { LoaderCircle } from "lucide-react";

/** Ruimte tussen onderkant tegeltje en bovenkant knop. */
const GAP_BELOW_TILE_PX = 32;

const DEFAULT_POSITION = { left: "50%", top: "61%" };

const buttonClassName = [
  "pointer-events-auto absolute z-6 -translate-x-1/2",
  "rounded-full",
  "bg-[#2243B2] px-[15px] py-[10px]",
  "text-[clamp(11px,0.95vw,14px)] font-semibold tracking-[0.02em] text-[#FFFFFF]",
  "cursor-pointer font-[inherit] whitespace-nowrap",
  "shadow-[0_5px_20px_rgba(0,0,0,0.25)]",
  "hover:bg-[#2D5BEB] hover:shadow-[0_10px_28px_rgba(0,0,0,0.38)]",
  "active:scale-[0.98] disabled:cursor-wait disabled:opacity-[0.72]",
].join(" ");
function projectBelowTileCenter(tile, camera, host) {
  const anchor = new THREE.Vector3();
  tile.updateMatrixWorld(true);
  tile.getWorldPosition(anchor);
  anchor.y -= tile.scale.y * 0.5;
  camera.updateMatrixWorld();
  anchor.project(camera);

  const width = host.clientWidth || 1;
  const height = host.clientHeight || 1;

  return {
    left: `${(anchor.x * 0.5 + 0.5) * width}px`,
    top: `${(-anchor.y * 0.5 + 0.5) * height + GAP_BELOW_TILE_PX}px`,
  };
}

/**
 * Download-knop, gecentreerd onder het zwevende tegeltje met ruimte ertussen.
 */
export default function TileDownloadButton({
  visible = false,
  tileRef,
  hostRef,
  cameraRef,
}) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [position, setPosition] = useState(DEFAULT_POSITION);

  useEffect(() => {
    if (!visible) return undefined;

    let frame = 0;
    const updatePosition = () => {
      const tile = tileRef?.current;
      const host = hostRef?.current;
      const camera = cameraRef?.current;

      if (tile && host && camera) {
        setPosition(projectBelowTileCenter(tile, camera, host));
      }

      frame = requestAnimationFrame(updatePosition);
    };

    frame = requestAnimationFrame(updatePosition);
    return () => cancelAnimationFrame(frame);
  }, [visible, tileRef, hostRef, cameraRef]);

  const handleDownload = useCallback(
    async (e) => {
      e.stopPropagation();
      const tile = tileRef?.current;
      if (!tile || isDownloading) return;
      setIsDownloading(true);
      try {
        await downloadTileAsGlb(tile);
      } catch (err) {
        console.error("Tegel-download mislukt:", err);
      } finally {
        setIsDownloading(false);
      }
    },
    [isDownloading, tileRef],
  );

  const stopSceneClick = useCallback((e) => {
    e.stopPropagation();
  }, []);

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-7 overflow-visible"
      data-tile-download
      aria-hidden={!visible}
    >
      <button
        type="button"
        className={buttonClassName}
        style={{ left: position.left, top: position.top }}
        onPointerDown={stopSceneClick}
        onClick={handleDownload}
        disabled={isDownloading}
        aria-label="Download jouw tegeltje als 3D-model (GLB)"
      >
        <span className="flex justify-center items-center gap-2">
          <Download size={16} />
          {isDownloading ? <LoaderCircle size={16} /> : "Download"}
        </span>
      </button>
    </div>
  );
}
