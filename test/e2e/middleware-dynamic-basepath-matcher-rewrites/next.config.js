module.exports = {
  basePath: '/docs',
  async rewrites() {
    // Any non-empty rewrites array sets __NEXT_HAS_REWRITES=true; this entry
    // only exists to flip that build flag, it isn't expected to match.
    return [{ source: '/never-matched-rewrite', destination: '/never' }]
  },
}
