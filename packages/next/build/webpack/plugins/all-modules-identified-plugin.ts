import { Compiler, Plugin } from 'webpack'

export class AllModulesIdentifiedPlugin implements Plugin {
  apply(compiler: Compiler) {
    compiler.hooks.compilation.tap(
      'AllModulesIdentifiedPlugin',
      compilation => {
        compilation.hooks.beforeModuleIds.tap(
          'AllModulesIdentifiedPlugin',
          modules => {
            ;(modules as any[]).forEach(module => {
              if (module.id != null || !module.identifier) {
                return
              }
              module.id = module.identifier()
            })
          }
        )
      }
    )
  }
}
