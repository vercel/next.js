import type { webpack } from 'next/dist/compiled/webpack/webpack'
import { clearModuleContext } from '../../../server/web/sandbox'
import { realpath } from '../../../lib/realpath'
import path from 'path'
import isError from '../../../lib/is-error'
import { clearManifestCache } from '../../../server/load-manifest'

type Compiler = webpack.Compiler
type WebpackPluginInstance = webpack.WebpackPluginInstance

const originModules = [
  require.resolve('../../../server/require'),
  require.resolve('../../../server/load-components'),
  require.resolve('../../../server/next-server'),
  require.resolve('../../../compiled/react-server-dom-webpack/client.edge'),
  require.resolve(
    '../../../compiled/react-server-dom-webpack-experimental/client.edge'
  ),
]

const RUNTIME_NAMES = ['webpack-runtime', 'webpack-api-runtime']

export function deleteAppClientCache() {
  if ((global as any)._nextDeleteAppClientCache) {
    ;(global as any)._nextDeleteAppClientCache()
  }
  // ensure we reset the cache for rsc components
  // loaded via react-server-dom-webpack
  const reactServerDomModId = require.resolve(
    'react-server-dom-webpack/client.edge'
  )
  const reactServerDomMod = require.cache[reactServerDomModId]

  if (reactServerDomMod) {
    for (const child of reactServerDomMod.children) {
      child.parent = null
      delete require.cache[child.id]
    }
  }
  delete require.cache[reactServerDomModId]
}

export async function deleteCache(filePath: string) {
  if ((global as any)._nextDeleteCache) {
    ;(global as any)._nextDeleteCache(filePath)
  }

  // try to clear it from the fs cache
  clearManifestCache(filePath)

  try {
    filePath = await realpath(filePath)
  } catch (e) {
    if (isError(e) && e.code !== 'ENOENT') throw e
  }
  const mod = require.cache[filePath]
  if (mod) {
    // remove the child reference from the originModules
    for (const originModule of originModules) {
      const parent = require.cache[originModule]
      if (parent) {
        const idx = parent.children.indexOf(mod)
        if (idx >= 0) parent.children.splice(idx, 1)
      }
    }
    // remove parent references from external modules
    for (const child of mod.children) {
      child.parent = null
    }
    delete require.cache[filePath]
    return true
  }
  return false
}

const PLUGIN_NAME = 'NextJsRequireCacheHotReloader'

// This plugin flushes require.cache after emitting the files. Providing 'hot reloading' of server files.
export class NextJsRequireCacheHotReloader implements WebpackPluginInstance {
  prevAssets: any = null
  hasServerComponents: boolean

  constructor(opts: { hasServerComponents: boolean }) {
    this.hasServerComponents = opts.hasServerComponents
  }

  apply(compiler: Compiler) {
    compiler.hooks.assetEmitted.tapPromise(
      PLUGIN_NAME,
      async (_file, { targetPath }) => {
        await deleteCache(targetPath)

        // Clear module context in other processes
        if ((global as any)._nextClearModuleContext) {
          ;(global as any)._nextClearModuleContext(targetPath)
        }
        // Clear module context in this process
        clearModuleContext(targetPath)
      }
    )

    compiler.hooks.afterEmit.tapPromise(PLUGIN_NAME, async (compilation) => {
      let hasAppPath = false

      // we need to make sure to clear all server entries from cache
      // since they can have a stale webpack-runtime cache
      // which needs to always be in-sync
      const entries = [...compilation.entries.keys()].filter((entry) => {
        const isAppPath = entry.toString().startsWith('app/')
        hasAppPath = hasAppPath || isAppPath
        return entry.toString().startsWith('pages/') || isAppPath
      })

      if (hasAppPath) {
      }

      await Promise.all([
        ...RUNTIME_NAMES.map((name) => {
          const runtimeChunkPath = path.join(
            compilation.outputOptions.path!,
            `${name}.js`
          )
          return deleteCache(runtimeChunkPath)
        }),
        ...entries.map((page) => {
          const outputPath = path.join(
            compilation.outputOptions.path!,
            page + '.js'
          )
          return deleteCache(outputPath)
        }),
      ])
    })
  }
}
