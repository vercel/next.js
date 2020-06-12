import { Compiler, Plugin } from 'webpack'
import { STRING_LITERAL_DROP_BUNDLE } from '../../../next-server/lib/constants'
import Entrypoint from 'webpack/lib/Entrypoint'

const PLUGIN_NAME = 'DropAmpFirstPagesPlugin'

// Recursively look up the issuer till it ends up at the root
function findEntryModule(issuer: any): any {
  if (issuer.issuer) {
    return findEntryModule(issuer.issuer)
  }

  return issuer
}

function handler(parser: any) {
  function markAsAmpFirst() {
    const entryModule = findEntryModule(parser.state.module)

    entryModule.buildMeta.NEXT_ampFirst = true
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

        compilation.hooks.optimizeChunksBasic.tap(PLUGIN_NAME, (chunks) => {
          for (let i = chunks.length - 1; i >= 0; i--) {
            const chunk = chunks[i]
            if (!chunk.entryModule.buildMeta.NEXT_ampFirst) {
              continue
            }

            for (const group of chunk.groupsIterable) {
              if (!(group instanceof Entrypoint)) {
                continue
              }

              group.NEXT_ampFirst = true
            }

            chunk.remove('AMP First page')
            chunks.splice(i, 1)
          }
        })
      }
    )
  }
}
