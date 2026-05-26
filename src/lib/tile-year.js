/** @typedef {'2024' | '2025' | '2026'} TileYear */

/** @type {readonly TileYear[]} */
export const TILE_YEAR_OPTIONS = ['2024', '2025', '2026'];

/**
 * @param {unknown} value
 * @returns {value is TileYear}
 */
export function isTileYear(value) {
  return (
    typeof value === 'string' && TILE_YEAR_OPTIONS.includes(/** @type {TileYear} */ (value))
  );
}
