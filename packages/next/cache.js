let cacheExports

if (process.env.NEXT_RUNTIME === '') {
  const {
    default: _default,
    ...exports
  } = require('./dist/api-cjs/cache.browser')
  cacheExports = exports
} else {
  // Keep server requires in this branch so browser builds can DCE them.
  const { default: _default, ...exports } = require('./dist/api-cjs/cache')
  cacheExports = exports
}

// https://nodejs.org/api/esm.html#commonjs-namespaces
// When importing CommonJS modules, the module.exports object is provided as the default export
module.exports = cacheExports

// Make import { xxx } from 'next/cache' work with Node's CommonJS named export detection.
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
exports.io = cacheExports.io
exports.unstable_navigation = cacheExports.unstable_navigation
exports.unstable_prefetch = cacheExports.unstable_prefetch
