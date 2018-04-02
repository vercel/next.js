// @flow
import { RawSource } from 'webpack-sources'
import { MATCH_ROUTE_NAME } from '../../utils'
import {PAGES_MANIFEST} from '../../../lib/constants'

// This plugin creates a pages-manifest.json from page entrypoints.
// This is used for mapping paths like `/` to `.next/dist/bundles/pages/index.js` when doing SSR
// It's also used by next export to provide defaultPathMap
export default class PagesManifestPlugin {
  apply (compiler: any) {
    compiler.plugin('emit', (compilation, callback) => {
      const {entries} = compilation
      const pages = {}

      for (const entry of entries) {
        const result = MATCH_ROUTE_NAME.exec(entry.name)
        if (!result) {
          continue
        }

        const pagePath = result[1]

        if (!pagePath) {
          continue
        }

        const {name} = entry
        pages[`/${pagePath.replace(/\\/g, '/')}`] = name
      }

      compilation.assets[PAGES_MANIFEST] = new RawSource(JSON.stringify(pages))
      callback()
    })
  }
}
