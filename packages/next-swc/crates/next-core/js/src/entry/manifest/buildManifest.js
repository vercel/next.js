;((manifest) => {
  // adapted from https://github.com/vercel/next.js/blob/canary/packages/next/src/build/webpack/plugins/build-manifest-plugin.ts#L54-L54
  function processRoute(rewrite) {
    // omit external rewrite destinations since these aren't
    // handled client-side
    if (!rewrite.destination.startsWith('/')) {
      delete rewrite.destination
    }
    return rewrite
  }

  manifest.__rewrites.beforeFiles.map(processRoute)
  manifest.__rewrites.afterFiles.map(processRoute)
  manifest.__rewrites.fallback.map(processRoute)

  self.__BUILD_MANIFEST = manifest
  self.__BUILD_MANIFEST_CB && self.__BUILD_MANIFEST_CB()
})($$MANIFEST$$)
