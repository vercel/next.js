import { ConcatSource } from 'webpack-sources'
import {
  IS_BUNDLED_PAGE,
  MATCH_ROUTE_NAME
} from '../../utils'

export default class PagesPlugin {
  apply (compiler) {
    compiler.plugin('compilation', (compilation) => {
      compilation.plugin('optimize-chunk-assets', (chunks, callback) => {
        const pages = chunks.filter(chunk => IS_BUNDLED_PAGE.test(chunk.name))

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
          if (!asset) return

          const concat = new ConcatSource()

          concat.add(`
            __NEXT_REGISTER_PAGE('${routeName}', function() {
              var comp = 
          `)
          concat.add(asset)
          concat.add(`
              return { page: comp.default }
            })
          `)

          // Replace the exisiting chunk with the new content
          compilation.assets[chunk.name] = concat
        })

        callback()
      })
    })
  }
}
