import Module from 'module'
import path, { join, resolve } from 'path'
import { SERVER_DIRECTORY } from '../shared/lib/constants'
import crypto from 'crypto'
import { readFileSync } from 'fs'
import vm from 'vm'

// @ts-ignore the property exists
const originalCompile = Module.prototype._compile

export function init(distDir: string) {
  try {
    const cacheManifest = require(resolve(
      join(distDir, SERVER_DIRECTORY, 'v8-cache-manifest.json')
    )) as { [hash: string]: string }
    // @ts-ignore the property exists

    module.prototype.require = function (id: string) {
      // do the resolution
      // read from the caching
      // return the result
    }

    Module.prototype._compile = function (content, filename) {
      const now = performance.now()
      const mod = this
      const hash = crypto.createHash('sha256').update(content).digest('hex')
      const cacheFile = cacheManifest[hash]
      // const cacheFile = false
      const shortFilename = filename.replace(distDir, '')

      if (cacheFile) {
        const cachePath = resolve(join(distDir, cacheFile))
        const timeBefore = performance.now()
        const cachedBuffer = readFileSync(cachePath)
        const timeAfter = performance.now()
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
            throw new Error(
              `Could not resolve ${specifier} during code caching`
            )
          },
        })

        const value = script.runInThisContext({
          filename: filename,
          lineOffset: 0,
          columnOffset: 0,
          displayErrors: true,
        })

        function require(id: string) {
          return mod.require(id)
        }

        // https://github.com/nodejs/node/blob/v10.15.3/lib/internal/modules/cjs/helpers.js#L28

        require.resolve = (request: any, options: any) => {
          // @ts-ignore
          return Module._resolveFilename(request, mod, false, options)
        }

        require.main = process.mainModule

        // Enable support to add extra extension types

        // @ts-ignore
        require.extensions = Module._extensions
        // @ts-ignore
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

        const buffer = script.createCachedData()

        if (
          buffer.length !== cachedBuffer.length &&
          buffer.length - cachedBuffer.length > 0
        ) {
          console.log(
            `Code cache updated for ${filename} (${
              buffer.length - cachedBuffer.length
            } bytes)`
          )
          // require('fs').promises.writeFile(cachePath, buffer)
        }

        console.log(
          `${shortFilename},${performance.now() - now},cached,${
            timeAfter - timeBefore
          },${script.cachedDataRejected}`
        )
        return res
      }

      const value = originalCompile.call(this, content, filename)
      // console.log(`${shortFilename},${performance.now() - now},uncached`)
      return value
    }
  } catch (err) {
    console.error('Failed to enable V8 code caching', err)
    // If the file is not found, we assume that the cache is invalid and
    // ignore the error.
    return
  }
}
