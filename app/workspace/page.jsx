'use client';

/**
 * Workspace pagina — bestaande layout + dynamisch gerenderde AI-tegels.
 * De floating "Nieuwe tegel" knop opent de AI chat-overlay.
 */

import { AnimatePresence } from 'framer-motion';
import GeneratedTile from '@/components/generated/generated-tile';
import NewTileButton from '@/components/ai/new-tile-button';
import { useGeneratedTilesStore } from '@/store/generated-tiles-store';

export default function WorkspacePage() {
  const tiles = useGeneratedTilesStore((s) => s.tiles);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#f7fbff] pb-28">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(23,89,187,0.08)_0%,_transparent_60%)]"
      />

      <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <header className="mb-10">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600/60">
            Digital Thank You
          </p>
          <h1
            className="mt-2 text-3xl font-bold text-[#1759bb] sm:text-4xl"
            style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
          >
            Workspace
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-600">
            Beheer en genereer tegels voor je digitale muur. Klik op{' '}
            <span className="font-medium text-blue-700">Nieuwe tegel</span> om
            via AI een tegel te maken — geen developer nodig.
          </p>
        </header>

        {tiles.length === 0 && (
          <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-2xl border border-dashed border-blue-200/60 bg-white/50 px-6 py-16 text-center backdrop-blur-sm">
            <p
              className="text-lg font-semibold text-[#1759bb]/70"
              style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
            >
              Nog geen tegels
            </p>
            <p className="mt-2 max-w-sm text-sm text-slate-500">
              Gebruik de knop rechtsonder om je eerste AI-gegenereerde tegel
              te maken.
            </p>
          </div>
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

      <NewTileButton />
    </div>
  );
}
