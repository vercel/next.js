import type { webpack } from 'next/dist/compiled/webpack/webpack'

const PLUGIN_NAME = 'ChunkCacheClearPlugin'

/**
 * This plugin exposes a global function to clear webpack's chunk cache (installedChunks).
 * This allows Next.js to retry loading chunks after a failure.
 *
 * Webpack caches chunk loading promises in `installedChunks`, which is a private variable
 * inside the JSONP chunk loading runtime. When a chunk fails to load, the rejected promise
 * is cached and subsequent loads return the same rejected promise.
 *
 * This plugin adds code to the webpack runtime that exposes `__next_clear_chunk_cache__`
 * on globalThis, allowing Next.js to clear failed entries before retrying.
 */
export class ChunkCacheClearPlugin {
  apply(compiler: webpack.Compiler) {
    compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation) => {
      // Hook into runtime module generation
      compilation.hooks.runtimeModule.tap(PLUGIN_NAME, (module) => {
        // Target the jsonp chunk loading module (used in browsers)
        // The module name varies by webpack version, so check for common names
        const moduleName = module.name || ''
        if (
          moduleName === 'jsonp chunk loading' ||
          moduleName === 'chunk loading' ||
          moduleName.includes('chunk loading')
        ) {
          // Get the original generated code
          const originalGenerateCode = module.generate?.bind(module)
          if (originalGenerateCode) {
            module.generate = function () {
              const code = originalGenerateCode()
              if (typeof code !== 'string') return code

              // Find where installedChunks is defined and inject our clearing function
              // The pattern is: var installedChunks = { ... };
              const installedChunksPattern =
                /(var\s+installedChunks\s*=\s*\{[^}]*\};?)/

              if (installedChunksPattern.test(code)) {
                const injectedCode = `
// Next.js chunk cache clearing for retry logic
if (typeof globalThis !== 'undefined') {
  globalThis.__next_clear_chunk_cache__ = function(chunkId) {
    // Only clear if not already loaded (0 means loaded)
    if (installedChunks[chunkId] !== 0 && installedChunks[chunkId] !== undefined) {
      delete installedChunks[chunkId];
    }
  };
}
`
                return code.replace(
                  installedChunksPattern,
                  `$1\n${injectedCode}`
                )
              }

              return code
            }
          }
        }
      })
    })
  }
}
