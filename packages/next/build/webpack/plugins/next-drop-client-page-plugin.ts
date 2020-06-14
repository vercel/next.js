import { Compiler, compilation as CompilationType, Plugin } from 'webpack'
import { STRING_LITERAL_DROP_BUNDLE } from '../../../next-server/lib/constants'

export const ampFirstEntryNamesMap: WeakMap<
  CompilationType.Compilation,
  string[]
> = new WeakMap()

const PLUGIN_NAME = 'DropAmpFirstPagesPlugin'

// Recursively look up the issuer till it ends up at the root
function findEntryModule(mod: any): CompilationType.Module | null {
  const queue = new Set([mod])
  for (const module of queue) {
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

  parser.hooks.varDeclarationConst
    .for(STRING_LITERAL_DROP_BUNDLE)
    .tap(PLUGIN_NAME, markAsAmpFirst)

  parser.hooks.varDeclarationLet
    .for(STRING_LITERAL_DROP_BUNDLE)
    .tap(PLUGIN_NAME, markAsAmpFirst)

  parser.hooks.varDeclaration
    .for(STRING_LITERAL_DROP_BUNDLE)
    .tap(PLUGIN_NAME, markAsAmpFirst)
}

// Prevents outputting client pages when they are not needed
export class DropClientPage implements Plugin {
  ampPages = new Set()

  apply(compiler: Compiler) {
    compiler.hooks.compilation.tap(
      PLUGIN_NAME,
      (compilation, { normalModuleFactory }) => {
        normalModuleFactory.hooks.parser
          .for('javascript/auto')
          .tap(PLUGIN_NAME, handler)

        if (!ampFirstEntryNamesMap.has(compilation)) {
          ampFirstEntryNamesMap.set(compilation, [])
        }

        const ampFirstEntryNamesItem = ampFirstEntryNamesMap.get(
          compilation
        ) as string[]

        compilation.hooks.seal.tap(PLUGIN_NAME, () => {
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
