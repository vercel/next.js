import { Compiler, Plugin } from 'webpack'

export class SharedRuntimePlugin implements Plugin {
  apply(compiler: Compiler) {
    const installedModules = [
      '// The module cache',
      'var installedModules = {};',
    ].join('\n')
    const nextInstalledModules = [
      '// The Next.js shared module cache',
      'var installedModules = window.__next_installed_modules__ || (window.__next_installed_modules__ = {});',
    ].join('\n')

    compiler.hooks.compilation.tap('SharedRuntimePlugin', compilation => {
      ;(compilation.mainTemplate as any).hooks.localVars.intercept({
        register: (tapInfo: any) => {
          if (!(tapInfo.name === 'MainTemplate' && tapInfo.type === 'sync')) {
            return tapInfo
          }

          const { fn } = tapInfo
          return {
            ...tapInfo,
            fn: function() {
              const ret = fn.apply(this, arguments)
              return typeof ret === 'string'
                ? ret.replace(installedModules, nextInstalledModules)
                : ret
            },
          }
        },
      })
    })
  }
}
