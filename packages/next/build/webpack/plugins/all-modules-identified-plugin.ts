import { Compiler, Plugin } from 'webpack'
import { createHash } from 'crypto'

export class AllModulesIdentifiedPlugin implements Plugin {
  apply(compiler: Compiler) {
    compiler.hooks.compilation.tap(
      'AllModulesIdentifiedPlugin',
      compilation => {
        compilation.hooks.beforeModuleIds.tap(
          'AllModulesIdentifiedPlugin',
          modules => {
            ;(modules as any[]).forEach(m => {
              if (m.id != null || !m.identifier) {
                return
              }

              const identifier = m.identifier()

              // This hashing algorithm is consistent with how the rest of
              // webpack does it (n.b. HashedModuleIdsPlugin)
              m.id = createHash('md4')
                .update(identifier)
                .digest('hex')
                .substr(0, 4)
            })
          }
        )
      }
    )
  }
}
