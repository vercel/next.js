// Note: This file is JS because it's used by the taskfile-swc.js file, which is JS.
// Keep file changes in sync with the corresponding `.d.ts` files.

/**
 * These are the minimum browser versions that we consider "modern" and thus compile for by default.
 * This list was generated using `pnpm browserslist "baseline widely available"` on 2025-10-01.
 */
const MODERN_BROWSERSLIST_TARGET = [
  'chrome 111',
  'edge 111',
  'firefox 111',
  'safari 16.4',
]

module.exports = MODERN_BROWSERSLIST_TARGET
