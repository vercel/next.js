import { Compiler, Plugin } from 'webpack'
import { RawSource } from 'webpack-sources'
import { PAGES_MANIFEST } from '../../../next-server/lib/constants'
import getRouteFromEntrypoint from '../../../next-server/server/get-route-from-entrypoint'

export type PagesManifest = { [page: string]: string }

// This plugin creates a pages-manifest.json from page entrypoints.
// This is used for mapping paths like `/` to `.next/server/static/<buildid>/pages/index.js` when doing SSR
// It's also used by next export to provide defaultPathMap
export default class PagesManifestPlugin implements Plugin {
  serverless: boolean

  constructor(serverless: boolean) {
    this.serverless = serverless
  }

  apply(compiler: Compiler): void {
    compiler.hooks.emit.tap('NextJsPagesManifest', (compilation) => {
      const { chunks } = compilation
      const pages: PagesManifest = {}

      for (const chunk of chunks) {
        const pagePath = getRouteFromEntrypoint(chunk.name, this.serverless)

        if (!pagePath) {
          continue
        }

        // Write filename, replace any backslashes in path (on windows) with forwardslashes for cross-platform consistency.
        pages[pagePath] = chunk.name.replace(/\\/g, '/')
      }

      compilation.assets[PAGES_MANIFEST] = new RawSource(
        JSON.stringify(pages, null, 2)
      )
    })
  }
}
