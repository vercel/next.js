// Benchmark cases for `import defer`. Each case uses its own generated tree
// (see scripts/prepare-bench.mjs).
export const deferCases = {
  // Every module of the tree uses `import defer` for its children
  'esm-defer-tree': () => import('./esm-defer-tree.js'),
  // Top-level eager import of the tree (baseline)
  'esm-eager': () => import('./esm-eager.js'),
  // Top-level `import defer` of the tree, accessed in `execute()`
  'esm-deferred': () => import('./esm-deferred.js'),
  // Top-level `import defer` of the tree, never accessed
  'esm-deferred-unused': () => import('./esm-deferred-unused.js'),
}
