import { Compiler, Plugin } from 'next/dist/compiled/webpack.js'
import { RawSource } from 'webpack-sources'
import {
  PAGES_MANIFEST,
  ROUTE_NAME_REGEX,
  SERVERLESS_ROUTE_NAME_REGEX,
} from 'next-server/constants'

// This plugin creates a pages-manifest.json from page entrypoints.
// This is used for mapping paths like `/` to `.next/server/static/<buildid>/pages/index.js` when doing SSR
// It's also used by next export to provide defaultPathMap
export default class PagesManifestPlugin implements Plugin {
  serverless: boolean

  constructor(serverless: boolean) {
    this.serverless = serverless
  }

  apply(compiler: Compiler): void {
    compiler.hooks.emit.tap('NextJsPagesManifest', compilation => {
      const { chunks } = compilation
      const pages: { [page: string]: string } = {}

      for (const chunk of chunks) {
        const result = (this.serverless
          ? SERVERLESS_ROUTE_NAME_REGEX
          : ROUTE_NAME_REGEX
        ).exec(chunk.name)

        if (!result) {
          continue
        }

        const pagePath = result[1]

        if (!pagePath) {
          continue
        }

        // Write filename, replace any backslashes in path (on windows) with forwardslashes for cross-platform consistency.
        pages[`/${pagePath.replace(/\\/g, '/')}`] = chunk.name.replace(
          /\\/g,
          '/'
        )
      }

      if (typeof pages['/index'] !== 'undefined') {
        pages['/'] = pages['/index']
      }

      compilation.assets[PAGES_MANIFEST] = new RawSource(JSON.stringify(pages))
    })
  }
}
