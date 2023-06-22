import Module from 'module'
import path, { join, resolve } from 'path'
import { SERVER_DIRECTORY } from '../shared/lib/constants'
import crypto from 'crypto'
import { readFileSync } from 'fs'
import vm from 'vm'

// @ts-ignore the property exists
const originalCompile = Module.prototype._compile

export function init(distDir: string) {
  const self = this

  const hasRequireResolvePaths = typeof require.resolve.paths === 'function'
  this._previousModuleCompile = Module.prototype._compile
  try {
    const cacheManifest = require(resolve(
      join(distDir, SERVER_DIRECTORY, 'v8-cache-manifest.json')
    )) as { [hash: string]: string }
    // @ts-ignore the property exists
    Module.prototype._compile = function (content, filename) {
      const mod = this
      const hash = crypto.createHash('sha256').update(content).digest('hex')
      const cacheFile = cacheManifest[hash]
      if (cacheFile) {
        const cachePath = resolve(join(distDir, cacheFile))
        const cachedBuffer = readFileSync(cachePath)
        const wrapped = Module.wrap(content)

        const script = new vm.Script(wrapped, {
          filename: filename,
          cachedData: cachedBuffer,
          // @ts-ignore
          importModuleDynamically: async (
            specifier,
            script,
            importAssertions
          ) => {
            const { resolve } = await import('import-meta-resolve')
            const resolved = await resolve(specifier, filename)

            if (!resolved) {
              throw new Error(
                `Could not resolve ${specifier} during code caching`
              )
            }
            return import(resolved)
          },
        })

        const value = script.runInThisContext({
          filename: filename,
          lineOffset: 0,
          columnOffset: 0,
          displayErrors: true,
        })

        function require(id) {
          return mod.require(id)
        }

        // https://github.com/nodejs/node/blob/v10.15.3/lib/internal/modules/cjs/helpers.js#L28
        function resolve(request, options) {
          return Module._resolveFilename(request, mod, false, options)
        }
        require.resolve = resolve

        require.main = process.mainModule

        // Enable support to add extra extension types
        require.extensions = Module._extensions
        require.cache = Module._cache

        const dirname = path.dirname(filename)
        const res = value.apply(mod.exports, [
          mod.exports,
          require,
          mod,
          filename,
          dirname,
          process,
          global,
          Buffer,
        ])
        return res
      }

      const value = originalCompile.call(this, content, filename)
      console.log('cache miss', filename)
      return value
    }
  } catch (err) {
    // If the file is not found, we assume that the cache is invalid and
    // ignore the error.
    return
  }
}
