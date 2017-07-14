import Concat from 'concat-with-sourcemaps'
import {
  IS_BUNDLED_PAGE,
  MATCH_ROUTE_NAME
} from '../../utils'

export default class PagesPlugin {
  apply (compiler) {
    compiler.plugin('after-compile', (compilation, callback) => {
      const pages = Object
        .keys(compilation.namedChunks)
        .map(key => compilation.namedChunks[key])
        .filter(chunk => IS_BUNDLED_PAGE.test(chunk.name))

      pages.forEach((chunk) => {
        const pageName = MATCH_ROUTE_NAME.exec(chunk.name)[1]
        let routeName = pageName

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

        // Replace the exisiting chunk with the new content
        const asset = compilation.assets[chunk.name]
        const sourceMap = compilation.assets[`${chunk.name}.map`]
        if (!asset) return

        const concat = new Concat(true, chunk.name, '\n')

        concat.add(null, `
          window.__NEXT_REGISTER_PAGE('${routeName}', function() {
            var comp = 
        `)
        concat.add(chunk.name, asset.source(), sourceMap && sourceMap.source())
        concat.add(null, `
            return { page: comp.default }
          })
        `)
        concat.add(null, `//# sourceMappingURL=${chunk.name}.map\n`)

        // Replace the exisiting chunk with the new content
        compilation.assets[chunk.name] = {
          size: () => concat.content.length,
          source: () => concat.content
        }

        if (sourceMap) {
          compilation.assets[`${chunk.name}.map`] = {
            size: () => concat.sourceMap.length,
            source: () => concat.sourceMap
          }
        }
      })
      callback()
    })
  }
}
