import { ConcatSource } from 'webpack-sources'
import {
  IS_BUNDLED_PAGE_REGEX,
  ROUTE_NAME_REGEX
} from '../../lib/constants'

class PageChunkTemplatePlugin {
  apply (chunkTemplate) {
    chunkTemplate.plugin('render', function (modules, chunk) {
      if (!IS_BUNDLED_PAGE_REGEX.test(chunk.name)) {
        return modules
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

      const source = new ConcatSource()

      source.add(`__NEXT_REGISTER_PAGE('${routeName}', function() {
          var comp =
      `)
      source.add(modules)
      source.add(`
          return { page: comp.default }
        })
      `)

      return source
    })
  }
}

export default class PagesPlugin {
  apply (compiler) {
    compiler.plugin('compilation', (compilation) => {
      compilation.chunkTemplate.apply(new PageChunkTemplatePlugin())
    })
  }
}
