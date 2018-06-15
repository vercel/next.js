// @flow
import { RawSource } from 'webpack-sources'
import {PAGES_MANIFEST, ROUTE_NAME_REGEX} from '../../lib/constants'

// This plugin creates a pages-manifest.json from page entrypoints.
// This is used for mapping paths like `/` to `.next/dist/bundles/pages/index.js` when doing SSR
// It's also used by next export to provide defaultPathMap
export default class PagesManifestPlugin {
  apply (compiler: any) {
    compiler.plugin('emit', (compilation, callback) => {
      const {entries} = compilation
      const pages = {}

      for (const entry of entries) {
        const result = ROUTE_NAME_REGEX.exec(entry.name)
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

      if (typeof pages['/index'] !== 'undefined') {
        pages['/'] = pages['/index']
      }

      compilation.assets[PAGES_MANIFEST] = new RawSource(JSON.stringify(pages))
      callback()
    })
  }
}
