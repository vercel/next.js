// @flow
import { ConcatSource } from 'webpack-sources'
import {
  IS_BUNDLED_PAGE_REGEX,
  ROUTE_NAME_REGEX
} from '../../../lib/constants'

export default class PagesPlugin {
  apply (compiler: any) {
    compiler.hooks.compilation.tap('PagesPlugin', (compilation) => {
      // This hook is triggered right before a module gets wrapped into it's initializing function,
      // For example when you look at the source of a bundle you'll see an object holding `'pages/_app.js': function(module, etc, etc)`
      // This hook triggers right before that code is added and wraps the module into `__NEXT_REGISTER_PAGE` when the module is a page
      // The reason we're doing this is that we don't want to execute the page code which has potential side effects before switching to a route
      compilation.moduleTemplates.javascript.hooks.render.tap('PagesPluginRenderPageRegister', (moduleSourcePostModule, module, options) => {
        const {chunk} = options

        // check if the current module is the entry module, we only want to wrap the topmost module
        if (chunk.entryModule !== module) {
          return moduleSourcePostModule
        }

        // Check if the chunk is a page
        if (!IS_BUNDLED_PAGE_REGEX.test(chunk.name)) {
          return moduleSourcePostModule
        }

        // Match the route the chunk belongs to
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
