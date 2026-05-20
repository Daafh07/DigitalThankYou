"use client";

import { useCallback, useState } from "react";
import { downloadTileAsGlb } from "../../lib/download-tile";

const buttonClassName = [
  "absolute right-[max(10px,1.6%)] bottom-[max(10px,2.8%)] z-[6]",
  "rounded-full border border-[rgba(23,89,187,0.35)]",
  "bg-[rgba(255,253,248,0.94)] px-[0.95em] pt-[0.42em] pb-[0.48em]",
  "text-[clamp(11px,0.95vw,14px)] font-semibold tracking-[0.02em] text-[#1759bb]",
  "cursor-pointer font-[inherit]",
  "shadow-[0_1px_2px_rgba(15,46,92,0.06),0_6px_20px_rgba(23,89,187,0.1)]",
  "transition-[background,border-color,box-shadow,transform] duration-[180ms] ease-in-out",
  "hover:border-[rgba(23,89,187,0.5)] hover:bg-white",
  "hover:shadow-[0_2px_4px_rgba(15,46,92,0.08),0_10px_28px_rgba(23,89,187,0.14)]",
  "active:scale-[0.98] disabled:cursor-wait disabled:opacity-[0.72]",
].join(" ");

/**
 * Download-knop voor het zwevende keramische tegeltje (GLB-export).
 */
export default function TileDownloadButton({ visible = false, tileRef }) {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = useCallback(async () => {
    const tile = tileRef?.current;
    if (!tile || isDownloading) return;
    setIsDownloading(true);
    try {
      await downloadTileAsGlb(tile);
    } finally {
      setIsDownloading(false);
    }
  }, [isDownloading, tileRef]);

  if (!visible) return null;

  return (
    <button
      type="button"
      className={buttonClassName}
      onClick={handleDownload}
      disabled={isDownloading}
      aria-label="Download jouw tegeltje als 3D-model (GLB)"
    >
      {isDownloading ? "Bezig met downloaden…" : "Download tegeltje"}
    </button>
  );
}
