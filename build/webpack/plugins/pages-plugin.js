// @flow
import { ConcatSource } from 'webpack-sources'
import {
  IS_BUNDLED_PAGE_REGEX,
  ROUTE_NAME_REGEX
} from '../../../lib/constants'

export default class PagesPlugin {
  apply (compiler: any) {
    compiler.hooks.compilation.tap('PagesPlugin', (compilation) => {
      compilation.moduleTemplates.javascript.hooks.render.tap('PagesPluginRenderPageRegister', (moduleSourcePostModule, module, options) => {
        const {chunk} = options

        // check if the current module is the entry module
        if (chunk.entryModule !== module) {
          return moduleSourcePostModule
        }

        if (!IS_BUNDLED_PAGE_REGEX.test(chunk.name)) {
          return moduleSourcePostModule
        }

        let routeName = ROUTE_NAME_REGEX.exec(chunk.name)[1]

        // We need to convert \ into / when we are in windows
        // to get the proper route name
        // Here we need to do windows check because it's possible
        // to have "\" in the filename in unix.
        // Anyway if someone did that, he'll be having issues here.
        // But that's something we cannot avoid.
        if (/^win/.test(process.platform)) {
          routeName = routeName.replace(/\\/g, '/')
        }

        routeName = `/${routeName.replace(/(^|\/)index$/, '')}`

        const source = new ConcatSource(
          `__NEXT_REGISTER_PAGE('${routeName}', function() {\n`,
          moduleSourcePostModule,
          '\nreturn { page: module.exports.default }',
          '});'
        )

        return source
      })
    })
  }
}
