import type { webpack5 } from 'next/dist/compiled/webpack/webpack'
import { clearModuleContext } from '../../../server/web/sandbox'
import { realpathSync } from 'fs'
import path from 'path'
import isError from '../../../lib/is-error'
import { NEXT_CLIENT_SSR_ENTRY_SUFFIX } from '../../../shared/lib/constants'

type Compiler = webpack5.Compiler
type WebpackPluginInstance = webpack5.WebpackPluginInstance

const originModules = [
  require.resolve('../../../server/require'),
  require.resolve('../../../server/load-components'),
]

const RUNTIME_NAMES = ['webpack-runtime', 'webpack-api-runtime']

function deleteCache(filePath: string) {
  try {
    filePath = realpathSync(filePath)
  } catch (e) {
    if (isError(e) && e.code !== 'ENOENT') throw e
  }
  const module = require.cache[filePath]
  if (module) {
    // remove the child reference from the originModules
    for (const originModule of originModules) {
      const parent = require.cache[originModule]
      if (parent) {
        const idx = parent.children.indexOf(module)
        if (idx >= 0) parent.children.splice(idx, 1)
      }
    }
    // remove parent references from external modules
    for (const child of module.children) {
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
  previousOutputPathsWebpack5: Set<string> = new Set()
  currentOutputPathsWebpack5: Set<string> = new Set()

  constructor(opts: { hasServerComponents: boolean }) {
    this.hasServerComponents = opts.hasServerComponents
  }

  apply(compiler: Compiler) {
    compiler.hooks.assetEmitted.tap(
      PLUGIN_NAME,
      (file, { targetPath, content }) => {
        this.currentOutputPathsWebpack5.add(targetPath)
        deleteCache(targetPath)
        clearModuleContext(targetPath, content.toString('utf-8'))

        if (
          this.hasServerComponents &&
          /^(app|pages)\//.test(file) &&
          /\.js$/.test(targetPath)
        ) {
          // Also clear the potential __sc_client__ cache.
          // @TODO: Investigate why the client ssr bundle isn't emitted as an asset here.
          const clientComponentsSSRTarget = targetPath.replace(
            /\.js$/,
            NEXT_CLIENT_SSR_ENTRY_SUFFIX + '.js'
          )
          if (deleteCache(clientComponentsSSRTarget)) {
            this.currentOutputPathsWebpack5.add(clientComponentsSSRTarget)
            clearModuleContext(
              clientComponentsSSRTarget,
              content.toString('utf-8')
            )
          }
        }
      }
    )

    compiler.hooks.afterEmit.tap(PLUGIN_NAME, (compilation) => {
      RUNTIME_NAMES.forEach((name) => {
        const runtimeChunkPath = path.join(
          compilation.outputOptions.path!,
          `${name}.js`
        )
        deleteCache(runtimeChunkPath)
      })

      // we need to make sure to clear all server entries from cache
      // since they can have a stale webpack-runtime cache
      // which needs to always be in-sync
      const entries = [...compilation.entries.keys()].filter((entry) =>
        entry.toString().startsWith('pages/')
      )

      entries.forEach((page) => {
        const outputPath = path.join(
          compilation.outputOptions.path!,
          page + '.js'
        )
        deleteCache(outputPath)
      })
    })

    this.previousOutputPathsWebpack5 = new Set(this.currentOutputPathsWebpack5)
    this.currentOutputPathsWebpack5.clear()
  }
}
