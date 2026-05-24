/**
 * Zustand store — beheert globaal alle AI-gegenereerde tegels op de workspace.
 */

import { create } from 'zustand';

/** @typedef {import('@/lib/ai/tile-schema').GeneratedTileData} GeneratedTileData */

/**
 * @typedef {Object} GeneratedTilesState
 * @property {GeneratedTileData[]} tiles
 * @property {(payload: Omit<GeneratedTileData, 'id' | 'createdAt'>) => GeneratedTileData} addTile
 * @property {(id: string) => void} removeTile
 */

let tileCounter = 0;

/** @type {import('zustand').StateCreator<GeneratedTilesState>} */
const storeCreator = (set) => ({
  tiles: [],

  /**
   * Voegt een nieuwe tegel toe aan de workspace.
   * Genereert automatisch een uniek id en timestamp.
   */
  addTile: (payload) => {
    const tile = {
      ...payload,
      id: `tile-${Date.now()}-${++tileCounter}`,
      createdAt: Date.now(),
    };

    set((state) => ({ tiles: [...state.tiles, tile] }));
    return tile;
  },

  /** Verwijdert een tegel op basis van id. */
  removeTile: (id) => {
    set((state) => ({
      tiles: state.tiles.filter((tile) => tile.id !== id),
    }));
  },
});

export const useGeneratedTilesStore = create(storeCreator);
