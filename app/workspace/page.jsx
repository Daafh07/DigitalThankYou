"use client";

/**
 * Workspace pagina — bestaande layout + dynamisch gerenderde AI-tegels.
 * De floating "Nieuwe tegel" knop opent de AI chat-overlay.
 */

import { AnimatePresence } from "framer-motion";
import { Home } from "lucide-react";
import GeneratedTile from "@/components/generated/generated-tile";
import AiChat from "@/components/ai/ai-chat";
import { useGeneratedTilesStore } from "@/store/generated-tiles-store";

export default function WorkspacePage() {
  const tiles = useGeneratedTilesStore((s) => s.tiles);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#f7fbff] pb-28">
      {/* Header (volledig blauw) */}
      <header className="relative bg-[#1f4fc9]">
        <a
          href="/"
          aria-label="Home"
          className={[
            "absolute left-6 top-6 z-10 inline-flex h-10 w-10 items-center justify-center",
            "rounded-full bg-white/90 text-[#1f4fc9] shadow-md",
            "transition hover:bg-white",
          ].join(" ")}
        >
          <Home size={18} />
        </a>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.16)_0%,transparent_60%)]"
        />
        <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1
              className="text-2xl font-bold tracking-tight text-white sm:text-3xl"
              style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
            >
              Delfts Blauw Tegeltje Generator
            </h1>
            <p className="mt-2 text-sm text-white/80">
              AI-assistent helpt je stap voor stap
            </p>
          </div>
        </div>
      </header>

      <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700/60">
              Digital Thank You
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Start direct met het uploaden van je logo.
            </p>
          </div>
        </div>

        {/* Chat altijd in beeld (design) */}
        <div className="mb-10">
          <AiChat isOpen onClose={() => {}} mode="inline" />
        </div>

        {tiles.length === 0 && (
          <p className="mx-auto max-w-3xl text-center text-sm text-slate-500">
            Nog geen tegels — volg de stappen hierboven om je eerste tegel te
            genereren.
          </p>
        )}

        {tiles.length > 0 && (
          <section
            aria-label="Gegenereerde tegels"
            className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3"
          >
            <AnimatePresence mode="popLayout">
              {tiles.map((tile, index) => (
                <GeneratedTile key={tile.id} tile={tile} index={index} />
              ))}
            </AnimatePresence>
          </section>
        )}
      </div>
    </div>
  );
}
