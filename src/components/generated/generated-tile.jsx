"use client";

/**
 * GeneratedTile — universele renderer voor AI-gegenereerde tegels.
 * Eén component, dynamische content, geen hardcoded tegeltypes.
 */

import { motion } from "framer-motion";
import { X } from "lucide-react";
import { useGeneratedTilesStore } from "@/store/generated-tiles-store";

/** Accent-kleuren gemapt op Tailwind-klassen */
const ACCENT_MAP = {
  blue: {
    ring: "ring-blue-400/30",
    glow: "from-blue-500/20 to-cyan-400/10",
    button: "bg-blue-600/80 hover:bg-blue-500/90 text-white",
    badge: "text-blue-300/90",
  },
  green: {
    ring: "ring-emerald-400/30",
    glow: "from-emerald-500/20 to-teal-400/10",
    button: "bg-emerald-600/80 hover:bg-emerald-500/90 text-white",
    badge: "text-emerald-300/90",
  },
  purple: {
    ring: "ring-purple-400/30",
    glow: "from-purple-500/20 to-violet-400/10",
    button: "bg-purple-600/80 hover:bg-purple-500/90 text-white",
    badge: "text-purple-300/90",
  },
  amber: {
    ring: "ring-amber-400/30",
    glow: "from-amber-500/20 to-orange-400/10",
    button: "bg-amber-600/80 hover:bg-amber-500/90 text-white",
    badge: "text-amber-300/90",
  },
  rose: {
    ring: "ring-rose-400/30",
    glow: "from-rose-500/20 to-pink-400/10",
    button: "bg-rose-600/80 hover:bg-rose-500/90 text-white",
    badge: "text-rose-300/90",
  },
};

const SIZE_MAP = {
  small: "min-h-[220px] md:col-span-1",
  medium: "min-h-[280px] md:col-span-1 lg:col-span-1",
  large: "min-h-[340px] md:col-span-2 lg:col-span-2",
};

/**
 * @param {{ tile: import('@/lib/ai/tile-schema').GeneratedTileData; index?: number }} props
 */
export default function GeneratedTile({ tile, index = 0 }) {
  const removeTile = useGeneratedTilesStore((s) => s.removeTile);

  const theme = tile.style?.theme ?? "dark";
  const accent = tile.style?.accent ?? "blue";
  const size = tile.style?.size ?? "medium";
  const palette = ACCENT_MAP[accent] ?? ACCENT_MAP.blue;

  const isDark = theme === "dark";

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94, y: -12 }}
      transition={{
        type: "spring",
        stiffness: 320,
        damping: 28,
        delay: index * 0.05,
      }}
      whileHover={{ y: -6, transition: { duration: 0.22 } }}
      className={[
        "group relative flex flex-col overflow-hidden rounded-2xl",
        "border backdrop-blur-xl shadow-xl ring-1",
        SIZE_MAP[size] ?? SIZE_MAP.medium,
        palette.ring,
        isDark
          ? "border-white/10 bg-white/5 text-white"
          : "border-blue-900/10 bg-white/70 text-slate-900",
      ].join(" ")}
    >
      {/* Gradient glow achtergrond */}
      <motion.div
        aria-hidden
        className={[
          "pointer-events-none absolute inset-0 bg-gradient-to-br opacity-60",
          palette.glow,
        ].join(" ")}
        initial={{ opacity: 0.3 }}
        whileHover={{ opacity: 0.85 }}
        transition={{ duration: 0.3 }}
      />

      {/* Verwijder-knop */}
      <button
        type="button"
        onClick={() => removeTile(tile.id)}
        aria-label="Tegel verwijderen"
        className={[
          "absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full",
          "opacity-0 transition-all duration-200 group-hover:opacity-100",
          isDark
            ? "bg-black/30 text-white/70 hover:bg-black/50 hover:text-white"
            : "bg-white/80 text-slate-500 hover:bg-white hover:text-slate-800",
        ].join(" ")}
      >
        <X size={14} />
      </button>

      {/* Tegelvoorvlak of afbeelding */}
      {(tile.tileTexture || tile.image) && (
        <motion.div
          className={[
            "relative w-full shrink-0 overflow-hidden",
            tile.tileTexture ? "h-44 bg-[#fff8ee]" : "h-36",
          ].join(" ")}
          whileHover={{ scale: 1.03 }}
          transition={{ duration: 0.35 }}
        >
          <img
            src={tile.tileTexture ?? tile.image}
            alt={tile.title}
            className={[
              "h-full w-full",
              tile.tileTexture ? "object-contain p-3" : "object-cover",
            ].join(" ")}
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
          <motion.div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"
            initial={{ opacity: 0.6 }}
            whileHover={{ opacity: 0.35 }}
          />
        </motion.div>
      )}

      {/* Content */}
      <motion.div
        className="relative z-10 flex flex-1 flex-col gap-2 p-5"
        initial={false}
      >
        {tile.subtitle && (
          <p
            className={[
              "text-xs font-medium uppercase tracking-widest",
              isDark ? palette.badge : "text-blue-700/70",
            ].join(" ")}
          >
            {tile.subtitle}
          </p>
        )}

        <h3
          className={[
            "font-serif text-xl font-bold leading-tight",
            isDark ? "text-white" : "text-slate-900",
          ].join(" ")}
          style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
        >
          {tile.title}
        </h3>

        {tile.description && (
          <p
            className={[
              "mt-1 line-clamp-3 text-sm leading-relaxed",
              isDark ? "text-white/70" : "text-slate-600",
            ].join(" ")}
          >
            {tile.description}
          </p>
        )}

        {tile.year && (
          <p
            className={[
              "mt-2 text-xs",
              isDark ? "text-white/45" : "text-slate-500",
            ].join(" ")}
          >
            Jaartal op achterkant: {tile.year}
          </p>
        )}

        {tile.buttonText && (
          <motion.button
            type="button"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className={[
              "mt-auto w-fit rounded-full px-4 py-2 text-sm font-medium",
              "backdrop-blur-sm transition-colors",
              palette.button,
            ].join(" ")}
          >
            {tile.buttonText}
          </motion.button>
        )}
      </motion.div>
    </motion.article>
  );
}
