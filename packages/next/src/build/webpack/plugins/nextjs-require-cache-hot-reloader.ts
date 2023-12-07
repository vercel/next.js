import type { webpack } from 'next/dist/compiled/webpack/webpack'
import { clearModuleContext } from '../../../server/web/sandbox'
import { realpathSync } from '../../../lib/realpath'
import path from 'path'
import isError from '../../../lib/is-error'
import { clearManifestCache } from '../../../server/load-manifest'

type Compiler = webpack.Compiler
type WebpackPluginInstance = webpack.WebpackPluginInstance

const originModules = [
  require.resolve('../../../server/require'),
  require.resolve('../../../server/load-components'),
  require.resolve('../../../server/next-server'),
  require.resolve('next/dist/compiled/next-server/app-page.runtime.dev.js'),
  require.resolve('next/dist/compiled/next-server/app-route.runtime.dev.js'),
  require.resolve('next/dist/compiled/next-server/pages.runtime.dev.js'),
  require.resolve('next/dist/compiled/next-server/pages-api.runtime.dev.js'),
]

const RUNTIME_NAMES = ['webpack-runtime', 'webpack-api-runtime']

function deleteFromRequireCache(filePath: string) {
  try {
    filePath = realpathSync(filePath)
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

export function deleteAppClientCache() {
  deleteFromRequireCache(
    require.resolve('next/dist/compiled/next-server/app-page.runtime.dev.js')
  )
  deleteFromRequireCache(
    require.resolve(
      'next/dist/compiled/next-server/app-page-experimental.runtime.dev.js'
    )
  )
}

export function deleteCache(filePath: string) {
  // try to clear it from the fs cache
  clearManifestCache(filePath)

  deleteFromRequireCache(filePath)
}

const PLUGIN_NAME = 'NextJsRequireCacheHotReloader'

// This plugin flushes require.cache after emitting the files. Providing 'hot reloading' of server files.
export class NextJsRequireCacheHotReloader implements WebpackPluginInstance {
  prevAssets: any = null
  serverComponents: boolean

  constructor(opts: { serverComponents: boolean }) {
    this.serverComponents = opts.serverComponents
  }

  apply(compiler: Compiler) {
    compiler.hooks.assetEmitted.tap(PLUGIN_NAME, (_file, { targetPath }) => {
      // Clear module context in this process
      clearModuleContext(targetPath)
      deleteCache(targetPath)
    })

    compiler.hooks.afterEmit.tapPromise(PLUGIN_NAME, async (compilation) => {
      for (const name of RUNTIME_NAMES) {
        const runtimeChunkPath = path.join(
          compilation.outputOptions.path!,
          `${name}.js`
        )
        deleteCache(runtimeChunkPath)
      }

      // we need to make sure to clear all server entries from cache
      // since they can have a stale webpack-runtime cache
      // which needs to always be in-sync
      let hasAppEntry = false
      const entries = [...compilation.entries.keys()].filter((entry) => {
        const isAppPath = entry.toString().startsWith('app/')
        if (isAppPath) hasAppEntry = true
        return entry.toString().startsWith('pages/') || isAppPath
      })

      if (hasAppEntry) {
        deleteAppClientCache()
      }

      for (const page of entries) {
        const outputPath = path.join(
          compilation.outputOptions.path!,
          page + '.js'
        )
        deleteCache(outputPath)
      }
    })
  }
}
