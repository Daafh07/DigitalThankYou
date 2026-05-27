"use client";

import { useCallback, useEffect, useState } from "react";
import * as THREE from "three";

const DEFAULT_POSITION = { left: "50%", top: "50%" };

function projectTileCenter(tile, camera, host) {
  const anchor = new THREE.Vector3();
  tile.updateMatrixWorld(true);
  tile.getWorldPosition(anchor);
  camera.updateMatrixWorld();
  anchor.project(camera);

  const width = host.clientWidth || 1;
  const height = host.clientHeight || 1;

  return {
    left: `${(anchor.x * 0.5 + 0.5) * width}px`,
    top: `${(-anchor.y * 0.5 + 0.5) * height}px`,
  };
}

export default function TileLookbackButton({
  visible = false,
  tileRef,
  hostRef,
  cameraRef,
  onClick,
}) {
  const [position, setPosition] = useState(DEFAULT_POSITION);

  useEffect(() => {
    if (!visible) return undefined;

    let frame = 0;
    const updatePosition = () => {
      const tile = tileRef?.current;
      const host = hostRef?.current;
      const camera = cameraRef?.current;

      if (tile && host && camera) {
        setPosition(projectTileCenter(tile, camera, host));
      }

      frame = requestAnimationFrame(updatePosition);
    };

    frame = requestAnimationFrame(updatePosition);
    return () => cancelAnimationFrame(frame);
  }, [cameraRef, hostRef, tileRef, visible]);

  const stopSceneClick = useCallback((event) => {
    event.stopPropagation();
  }, []);

  const handleClick = useCallback(
    (event) => {
      event.stopPropagation();
      onClick?.();
    },
    [onClick],
  );

  if (!visible) return null;

  return (
    <div
      className="tile-lookback-overlay"
      data-tile-lookback
      aria-hidden={!visible}
    >
      <button
        type="button"
        className="tile-lookback-cta"
        style={{ left: position.left, top: position.top }}
        onPointerDown={stopSceneClick}
        onClick={handleClick}
      >
        Let's take a look back
      </button>
    </div>
  );
}
