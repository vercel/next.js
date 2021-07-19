import { webpack } from 'next/dist/compiled/webpack/webpack'
import { isWebpack5 } from 'next/dist/compiled/webpack/webpack'
import { STRING_LITERAL_DROP_BUNDLE } from '../../../shared/lib/constants'

export const ampFirstEntryNamesMap: WeakMap<
  webpack.compilation.Compilation,
  string[]
> = new WeakMap()

const PLUGIN_NAME = 'DropAmpFirstPagesPlugin'

// Prevents outputting client pages when they are not needed
export class DropClientPage implements webpack.Plugin {
  ampPages = new Set()

  apply(compiler: webpack.Compiler) {
    compiler.hooks.compilation.tap(
      PLUGIN_NAME,
      (compilation: any, { normalModuleFactory }: any) => {
        // Recursively look up the issuer till it ends up at the root
        function findEntryModule(mod: any): webpack.compilation.Module | null {
          const queue = new Set([mod])
          for (const module of queue) {
            if (isWebpack5) {
              // @ts-ignore TODO: webpack 5 types
              const incomingConnections = compilation.moduleGraph.getIncomingConnections(
                module
              )

              for (const incomingConnection of incomingConnections) {
                if (!incomingConnection.originModule) return module
                queue.add(incomingConnection.originModule)
              }
              continue
            }

            for (const reason of module.reasons) {
              if (!reason.module) return module
              queue.add(reason.module)
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
            entryModule.buildInfo.NEXT_ampFirst = true
          }

          if (isWebpack5) {
            parser.hooks.preDeclarator.tap(PLUGIN_NAME, (declarator: any) => {
              if (declarator?.id?.name === STRING_LITERAL_DROP_BUNDLE) {
                markAsAmpFirst()
              }
            })
            return
          }

          parser.hooks.varDeclaration
            .for(STRING_LITERAL_DROP_BUNDLE)
            .tap(PLUGIN_NAME, markAsAmpFirst)
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
          if (isWebpack5) {
            for (const [name, entryData] of compilation.entries) {
              for (const dependency of entryData.dependencies) {
                // @ts-ignore TODO: webpack 5 types
                const module = compilation.moduleGraph.getModule(dependency)
                if (module?.buildInfo?.NEXT_ampFirst) {
                  ampFirstEntryNamesItem.push(name)
                  // @ts-ignore @types/webpack has outdated types for webpack 5
                  compilation.entries.delete(name)
                }
              }
            }
            return
          }
          // Remove preparedEntrypoint that has bundle drop marker
          // This will ensure webpack does not create chunks/bundles for this particular entrypoint
          for (
            let i = compilation._preparedEntrypoints.length - 1;
            i >= 0;
            i--
          ) {
            const entrypoint = compilation._preparedEntrypoints[i]
            if (entrypoint?.module?.buildInfo?.NEXT_ampFirst) {
              ampFirstEntryNamesItem.push(entrypoint.name)
              compilation._preparedEntrypoints.splice(i, 1)
            }
          }

          for (let i = compilation.entries.length - 1; i >= 0; i--) {
            const entryModule = compilation.entries[i]
            if (entryModule?.buildInfo?.NEXT_ampFirst) {
              compilation.entries.splice(i, 1)
            }
          }
        })
      }
    )
  }
}
