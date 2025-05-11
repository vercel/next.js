import { webpack, sources } from 'next/dist/compiled/webpack/webpack'
import {
  APP_BUILD_MANIFEST,
  CLIENT_STATIC_FILES_RUNTIME_MAIN_APP,
  SYSTEM_ENTRYPOINTS,
} from '../../../shared/lib/constants'
import { getEntrypointFiles } from './build-manifest-plugin'
import getAppRouteFromEntrypoint from '../../../server/get-app-route-from-entrypoint'

type Options = {
  dev: boolean
}

export type AppBuildManifest = {
  pages: Record<string, string[]>
}

const PLUGIN_NAME = 'AppBuildManifestPlugin'

export class AppBuildManifestPlugin {
  private readonly dev: boolean

  constructor(options: Options) {
    this.dev = options.dev
  }

  public apply(compiler: any) {
    compiler.hooks.make.tap(PLUGIN_NAME, (compilation: any) => {
      compilation.hooks.processAssets.tap(
        {
          name: PLUGIN_NAME,
          stage: webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONS,
        },
        () => this.createAsset(compilation)
      )
    })
  }

  private createAsset(compilation: webpack.Compilation) {
    const manifest: AppBuildManifest = {
      pages: {},
    }

    const mainFiles = new Set(
      getEntrypointFiles(
        compilation.entrypoints.get(CLIENT_STATIC_FILES_RUNTIME_MAIN_APP)
      )
    )

    for (const entrypoint of compilation.entrypoints.values()) {
      if (!entrypoint.name) {
        continue
      }

      if (SYSTEM_ENTRYPOINTS.has(entrypoint.name)) {
        continue
      }

      const pagePath = getAppRouteFromEntrypoint(entrypoint.name)
      if (!pagePath) {
        continue
      }

      const filesForPage = getEntrypointFiles(entrypoint)
      manifest.pages[pagePath] = [...new Set([...mainFiles, ...filesForPage])]
    }

    const json = JSON.stringify(manifest, null, 2)

    compilation.emitAsset(
      APP_BUILD_MANIFEST,
      new sources.RawSource(json) as unknown as webpack.sources.RawSource
    )
  }
}
