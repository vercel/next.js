// @flow
import { RawSource } from 'webpack-sources'
import {BUILD_MANIFEST, ROUTE_NAME_REGEX, IS_BUNDLED_PAGE_REGEX} from '../../../lib/constants'

// This plugin creates a build-manifest.json for all assets that are being output
// It has a mapping of "entry" filename to real filename. Because the real filename can be hashed in production
export default class BuildManifestPlugin {
  apply (compiler: any) {
    compiler.hooks.emit.tapAsync('NextJsBuildManifest', (compilation, callback) => {
      const {chunks} = compilation
      const assetMap = {pages: {}, css: []}

      const mainJsChunk = chunks.find((c) => c.name === 'static/commons/main.js')
      const mainJsFiles = mainJsChunk && mainJsChunk.files.length > 0 ? mainJsChunk.files.filter((file) => /\.js$/.test(file)) : []

      // compilation.entrypoints is a Map object, so iterating over it 0 is the key and 1 is the value
      for (const [, entrypoint] of compilation.entrypoints.entries()) {
        const result = ROUTE_NAME_REGEX.exec(entrypoint.name)
        if (!result) {
          continue
        }

        const pagePath = result[1]

        if (!pagePath) {
          continue
        }

        const filesForEntry = []

        for (const chunk of entrypoint.chunks) {
          // If there's no name
          if (!chunk.name || !chunk.files) {
            continue
          }

          for (const file of chunk.files) {
            // Only `.js` files are added for now. In the future we can also handle other file types.
            if (/\.map$/.test(file) || /\.hot-update\.js$/.test(file) || !/\.js$/.test(file)) {
              continue
            }

            // These are manually added to _document.js
            if (IS_BUNDLED_PAGE_REGEX.exec(file)) {
              continue
            }

            filesForEntry.push(file.replace(/\\/g, '/'))
          }
        }

        assetMap.pages[`/${pagePath.replace(/\\/g, '/')}`] = [...filesForEntry, ...mainJsFiles]
      }

      for (const chunk of chunks) {
        if (!chunk.name || !chunk.files) {
          continue
        }

        const files = []

        for (const file of chunk.files) {
          if (/\.map$/.test(file)) {
            continue
          }

          if (/\.hot-update\.js$/.test(file)) {
            continue
          }

          if (/\.css$/.exec(file)) {
            assetMap.css.push(file)
            continue
          }

          files.push(file)
        }

        if (files.length > 0) {
          assetMap[chunk.name] = files
        }
      }

      if (typeof assetMap.pages['/index'] !== 'undefined') {
        assetMap.pages['/'] = assetMap.pages['/index']
      }

      compilation.assets[BUILD_MANIFEST] = new RawSource(JSON.stringify(assetMap, null, 2))
      callback()
    })
  }
}
