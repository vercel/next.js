import { Compiler, Plugin } from 'webpack'
import { RawSource } from 'webpack-sources'
import { PAGES_MANIFEST } from '../../../next-server/lib/constants'
import getRouteFromEntrypoint from '../../../next-server/server/get-route-from-entrypoint'

export interface PagesManifest {
  nextVersion: string | undefined
  pages: { [page: string]: string }
}

// This plugin creates a pages-manifest.json from page entrypoints.
// This is used for mapping paths like `/` to `.next/server/static/<buildid>/pages/index.js` when doing SSR
// It's also used by next export to provide defaultPathMap
// Also stores the nextVersion to ensure server and build have the same version
export default class PagesManifestPlugin implements Plugin {
  serverless: boolean

  constructor(serverless: boolean) {
    this.serverless = serverless
  }

  apply(compiler: Compiler): void {
    compiler.hooks.emit.tap('NextJsPagesManifest', (compilation) => {
      const entrypoints = compilation.entrypoints
      const nextVersion: string = process.env.__NEXT_VERSION!
      const pagesManifest: PagesManifest = {
        nextVersion: nextVersion,
        pages: {},
      }
      for (const entrypoint of entrypoints.values()) {
        const pagePath = getRouteFromEntrypoint(
          entrypoint.name,
          this.serverless
        )

        if (!pagePath) {
          continue
        }

        const files = entrypoint
          .getFiles()
          .filter((file: string) => file.endsWith('.js'))

        if (files.length > 1) {
          console.log(
            `Found more than one file in server entrypoint ${entrypoint.name}`,
            files
          )
          continue
        }

        // Write filename, replace any backslashes in path (on windows) with forwardslashes for cross-platform consistency.
        pagesManifest.pages[pagePath] = files[0].replace(/\\/g, '/')
      }

      compilation.assets[PAGES_MANIFEST] = new RawSource(
        JSON.stringify(pagesManifest, null, 2)
      )
    })
  }
}
