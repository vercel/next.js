// Keep this module outside rendering bundles so chunk parents survive runtime
// invalidation. Unlike createRequire's synthetic parent, this module is in
// require.cache, where deleteCache can detach invalidated children.
export function requireChunk(chunkPath: string) {
  return require(chunkPath)
}
