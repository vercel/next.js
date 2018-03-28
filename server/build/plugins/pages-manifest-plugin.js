// @flow
import { RawSource } from 'webpack-sources'
import { MATCH_ROUTE_NAME } from '../../utils'
import {PAGES_MANIFEST} from '../../../lib/constants'

export default class PagesManifestPlugin {
  apply (compiler: any) {
    compiler.plugin('emit', (compilation, callback) => {
      const {entries} = compilation
      const pages = {}

      for (const entry of entries) {
        const pagePath = MATCH_ROUTE_NAME.exec(entry.name)[1]

        if (!pagePath) {
          continue
        }

        const {name} = entry
        pages[`/${pagePath}`] = name
      }

      compilation.assets[PAGES_MANIFEST] = new RawSource(JSON.stringify(pages))
      callback()
    })
  }
}
