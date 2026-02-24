let cacheExports

if (process.env.NEXT_RUNTIME === '') {
  const notAvailableInClient = (name) => {
    return function notAvailable() {
      throw new Error(`\`${name}\` is only available in a Server Component.`)
    }
  }

  cacheExports = {
    unstable_cache: function unstable_cache(cb) {
      // Legacy behavior: allow importing/using unstable_cache from client bundles
      // without pulling in server internals.
      if (typeof cb !== 'function') return cb
      return function cached() {
        return cb.apply(this, arguments)
      }
    },
    unstable_noStore: function unstable_noStore() {},

    updateTag: notAvailableInClient('updateTag'),
    revalidateTag: notAvailableInClient('revalidateTag'),
    revalidatePath: notAvailableInClient('revalidatePath'),
    refresh: notAvailableInClient('refresh'),
    cacheLife: notAvailableInClient('cacheLife'),
    cacheTag: notAvailableInClient('cacheTag'),
  }
} else {
  // Keep server requires in this branch so browser builds can DCE them.
  cacheExports = {
    unstable_cache:
      require('next/dist/server/web/spec-extension/unstable-cache')
        .unstable_cache,

    updateTag: require('next/dist/server/web/spec-extension/revalidate')
      .updateTag,

    revalidateTag: require('next/dist/server/web/spec-extension/revalidate')
      .revalidateTag,
    revalidatePath: require('next/dist/server/web/spec-extension/revalidate')
      .revalidatePath,

    refresh: require('next/dist/server/web/spec-extension/revalidate').refresh,

    unstable_noStore:
      require('next/dist/server/web/spec-extension/unstable-no-store')
        .unstable_noStore,
    cacheLife: require('next/dist/server/use-cache/cache-life').cacheLife,
    cacheTag: require('next/dist/server/use-cache/cache-tag').cacheTag,
  }
}

let didWarnCacheLife = false
function unstable_cacheLife() {
  if (!didWarnCacheLife) {
    didWarnCacheLife = true
    const error = new Error(
      '`unstable_cacheLife` was recently stabilized and should be imported as `cacheLife`. The `unstable` prefixed form will be removed in a future version of Next.js.'
    )
    console.error(error)
  }
  return cacheExports.cacheLife.apply(this, arguments)
}

let didWarnCacheTag = false
function unstable_cacheTag() {
  if (!didWarnCacheTag) {
    didWarnCacheTag = true
    const error = new Error(
      '`unstable_cacheTag` was recently stabilized and should be imported as `cacheTag`. The `unstable` prefixed form will be removed in a future version of Next.js.'
    )
    console.error(error)
  }
  return cacheExports.cacheTag.apply(this, arguments)
}

cacheExports.unstable_cacheLife = unstable_cacheLife
cacheExports.unstable_cacheTag = unstable_cacheTag

// https://nodejs.org/api/esm.html#commonjs-namespaces
// When importing CommonJS modules, the module.exports object is provided as the default export
module.exports = cacheExports

// make import { xxx } from 'next/cache' work
exports.unstable_cache = cacheExports.unstable_cache
exports.revalidatePath = cacheExports.revalidatePath
exports.revalidateTag = cacheExports.revalidateTag
exports.updateTag = cacheExports.updateTag
exports.unstable_noStore = cacheExports.unstable_noStore
exports.cacheLife = cacheExports.cacheLife
exports.unstable_cacheLife = cacheExports.unstable_cacheLife
exports.cacheTag = cacheExports.cacheTag
exports.unstable_cacheTag = cacheExports.unstable_cacheTag
exports.refresh = cacheExports.refresh
