const cacheExports = {
  unstable_cache: require('next/dist/server/web/spec-extension/unstable-cache')
    .unstable_cache,
  unstable_revalidateTag:
    require('next/dist/server/web/spec-extension/unstable-revalidate-tag')
      .unstable_revalidateTag,
  unstable_revalidatePath:
    require('next/dist/server/web/spec-extension/unstable-revalidate-path')
      .unstable_revalidatePath,
}

// https://nodejs.org/api/esm.html#commonjs-namespaces
// When importing CommonJS modules, the module.exports object is provided as the default export
module.exports = cacheExports

// make import { xxx } from 'next/server' work
exports.unstable_cache = cacheExports.unstable_cache
exports.unstable_revalidatePath = cacheExports.unstable_revalidatePath
exports.unstable_revalidateTag = cacheExports.unstable_revalidateTag
