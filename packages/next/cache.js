const cacheExports = {
  unstable_cache: require('next/dist/server/web/spec-extension/unstable-cache')
    .unstable_cache,

  revalidateTag: require('next/dist/server/web/spec-extension/revalidate')
    .revalidateTag,
  revalidatePath: require('next/dist/server/web/spec-extension/revalidate')
    .revalidatePath,

  unstable_expireTag: require('next/dist/server/web/spec-extension/revalidate')
    .unstable_expireTag,
  unstable_expirePath: require('next/dist/server/web/spec-extension/revalidate')
    .unstable_expirePath,

  unstable_noStore:
    require('next/dist/server/web/spec-extension/unstable-no-store')
      .unstable_noStore,
  unstable_cacheLife: require('next/dist/server/use-cache/cache-life')
    .cacheLife,
  unstable_cacheTag: require('next/dist/server/use-cache/cache-tag').cacheTag,
}

// https://nodejs.org/api/esm.html#commonjs-namespaces
// When importing CommonJS modules, the module.exports object is provided as the default export
module.exports = cacheExports

// make import { xxx } from 'next/cache' work
exports.unstable_cache = cacheExports.unstable_cache
exports.revalidatePath = cacheExports.revalidatePath
exports.revalidateTag = cacheExports.revalidateTag
exports.unstable_expireTag = cacheExports.unstable_expireTag
exports.unstable_expirePath = cacheExports.unstable_expirePath
exports.unstable_noStore = cacheExports.unstable_noStore
exports.unstable_cacheLife = cacheExports.unstable_cacheLife
exports.unstable_cacheTag = cacheExports.unstable_cacheTag
