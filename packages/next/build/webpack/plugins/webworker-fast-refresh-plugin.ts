import { Compiler } from 'webpack'
// @ts-ignore
import Template from 'webpack/lib/Template'

export default class WebWorkerFastRefreshPlugin {
  apply(compiler: Compiler) {
    compiler.hooks.compilation.tap('WebWorkerFastRefreshPlugin', function (
      compilation: any
    ) {
      compilation.mainTemplate.hooks.localVars.intercept({
        register(tapInfo: any) {
          if (tapInfo.name === 'WebWorkerMainTemplatePlugin') {
            const fn = tapInfo.fn
            tapInfo.fn = function () {
              const res = fn.apply(this, arguments)
              return Template.asString([
                res,
                '',
                '// noop fns to prevent runtime errors during initialization',
                'self.$RefreshReg$ = function () {};',
                'self.$RefreshSig$ = function () {',
                Template.indent('return function (type) {'),
                Template.indent(Template.indent('return type;')),
                Template.indent('};'),
                '};',
              ])
            }
          }
          return tapInfo
        },
      })
    })
  }
}
