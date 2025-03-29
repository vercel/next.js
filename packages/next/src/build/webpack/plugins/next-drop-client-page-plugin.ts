import type { webpack } from 'next/dist/compiled/webpack/webpack'
import { STRING_LITERAL_DROP_BUNDLE } from '../../../shared/lib/constants'
import { extname } from 'path'

export const ampFirstEntryNamesMap: WeakMap<webpack.Compilation, string[]> =
  new WeakMap()

const PLUGIN_NAME = 'DropAmpFirstPagesPlugin'

// Prevents outputting client pages when they are not needed
export class DropClientPage implements webpack.WebpackPluginInstance {
  ampPages = new Set<string>()

  apply(compiler: webpack.Compiler) {
    const isRspack = !!(compiler as any).rspack

    if (isRspack) {
      // For Rspack, use a simpler emit hook-based approach
      compiler.hooks.emit.tap(PLUGIN_NAME, (compilation: any) => {
        Object.keys(compilation.assets).forEach((assetKey) => {
          const asset = compilation.assets[assetKey]

          if (asset?._value?.includes?.('__NEXT_DROP_CLIENT_FILE__')) {
            const cleanAssetKey = assetKey.replace(/\\/g, '/')
            const page = '/' + cleanAssetKey.split('pages/')[1]
            const pageNoExt = page.split(extname(page))[0]

            delete compilation.assets[assetKey]

            // Detect being re-ran through a child compiler and don't re-mark the
            // page as AMP
            if (!pageNoExt.endsWith('.module')) {
              this.ampPages.add(pageNoExt.replace(/\/index$/, '') || '/')
            }
          }
        })
      })

      return
    }

    compiler.hooks.compilation.tap(
      PLUGIN_NAME,
      (compilation: any, { normalModuleFactory }: any) => {
        // Recursively look up the issuer till it ends up at the root
        function findEntryModule(mod: any): webpack.Module | null {
          const queue = new Set([mod])
          for (const module of queue) {
            const incomingConnections =
              compilation.moduleGraph.getIncomingConnections(module)

            for (const incomingConnection of incomingConnections) {
              if (!incomingConnection.originModule) return module
              queue.add(incomingConnection.originModule)
            }
          }

          return null
        }

        function handler(parser: any) {
          function markAsAmpFirst() {
            const entryModule = findEntryModule(parser.state.module)

            if (!entryModule) {
              return
            }

            // @ts-ignore buildInfo exists on Module
            entryModule.buildInfo = entryModule.buildInfo || {}
            entryModule.buildInfo.NEXT_ampFirst = true
          }

          parser.hooks.preDeclarator.tap(PLUGIN_NAME, (declarator: any) => {
            if (declarator?.id?.name === STRING_LITERAL_DROP_BUNDLE) {
              markAsAmpFirst()
            }
          })
        }

        normalModuleFactory.hooks.parser
          .for('javascript/auto')
          .tap(PLUGIN_NAME, handler)

        normalModuleFactory.hooks.parser
          .for('javascript/esm')
          .tap(PLUGIN_NAME, handler)

        normalModuleFactory.hooks.parser
          .for('javascript/dynamic')
          .tap(PLUGIN_NAME, handler)

        if (!ampFirstEntryNamesMap.has(compilation)) {
          ampFirstEntryNamesMap.set(compilation, [])
        }

        const ampFirstEntryNamesItem = ampFirstEntryNamesMap.get(
          compilation
        ) as string[]

        compilation.hooks.seal.tap(PLUGIN_NAME, () => {
          for (const [name, entryData] of compilation.entries) {
            for (const dependency of entryData.dependencies) {
              const module = compilation.moduleGraph.getModule(dependency)
              if (module?.buildInfo?.NEXT_ampFirst) {
                ampFirstEntryNamesItem.push(name)
                compilation.entries.delete(name)
              }
            }
          }
        })
      }
    )
  }
}
