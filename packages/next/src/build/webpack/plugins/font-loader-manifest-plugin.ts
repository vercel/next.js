import { webpack, sources } from 'next/dist/compiled/webpack/webpack'
import getRouteFromEntrypoint from '../../../server/get-route-from-entrypoint'
import { FONT_LOADER_MANIFEST } from '../../../shared/lib/constants'

export type FontLoaderManifest = {
  pages: {
    [path: string]: string[]
  }
  app: {
    [moduleRequest: string]: string[]
  }
  appUsingSizeAdjust: boolean
  pagesUsingSizeAdjust: boolean
}
const PLUGIN_NAME = 'FontLoaderManifestPlugin'

const fontLoaderTargets = [
  require.resolve('next/font/google/target.css'),
  require.resolve('next/font/local/target.css'),
  // TODO: remove this in the next major version
  /node_modules\/@next\/font\/google\/target\.css\?{.+}$/,
  /node_modules\/@next\/font\/local\/target\.css\?{.+}$/,
]

// Creates a manifest of all fonts that should be preloaded given a route
export class FontLoaderManifestPlugin {
  private appDirEnabled: boolean

  constructor(options: { appDirEnabled: boolean }) {
    this.appDirEnabled = options.appDirEnabled
  }

  apply(compiler: webpack.Compiler) {
    compiler.hooks.make.tap(PLUGIN_NAME, (compilation) => {
      let fontLoaderModules: webpack.Module[]

      // Get all font loader modules
      if (this.appDirEnabled) {
        compilation.hooks.finishModules.tap(PLUGIN_NAME, (modules) => {
          const modulesArr = Array.from(modules)
          fontLoaderModules = modulesArr.filter((mod: any) =>
            fontLoaderTargets.some((fontLoaderTarget) =>
              typeof fontLoaderTarget === 'string'
                ? mod.userRequest?.startsWith(`${fontLoaderTarget}?`)
                : fontLoaderTarget.test(mod.userRequest)
            )
          )
        })
      }

      compilation.hooks.processAssets.tap(
        {
          name: PLUGIN_NAME,
          stage: webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONS,
        },
        (assets: any) => {
          const fontLoaderManifest: FontLoaderManifest = {
            pages: {},
            app: {},
            appUsingSizeAdjust: false,
            pagesUsingSizeAdjust: false,
          }

          if (this.appDirEnabled) {
            for (const mod of fontLoaderModules) {
              if (!mod.buildInfo?.assets) continue
              const modAssets = Object.keys(mod.buildInfo.assets)
              const fontFiles: string[] = modAssets.filter((file: string) =>
                /\.(woff|woff2|eot|ttf|otf)$/.test(file)
              )

              if (!fontLoaderManifest.appUsingSizeAdjust) {
                fontLoaderManifest.appUsingSizeAdjust = fontFiles.some((file) =>
                  file.includes('-s')
                )
              }

              // Font files ending with .p.(woff|woff2|eot|ttf|otf) are preloaded
              const preloadedFontFiles: string[] = fontFiles.filter(
                (file: string) => /\.p.(woff|woff2|eot|ttf|otf)$/.test(file)
              )

              // Create an entry for the request even if no files should preload. If that's the case a preconnect tag is added.
              if (fontFiles.length > 0) {
                fontLoaderManifest.app[(mod as any).userRequest] =
                  preloadedFontFiles
              }
            }
          }

          for (const entrypoint of compilation.entrypoints.values()) {
            const pagePath = getRouteFromEntrypoint(entrypoint.name!)

            if (!pagePath) {
              continue
            }

            const fontFiles: string[] = entrypoint.chunks
              .flatMap((chunk: any) => [...chunk.auxiliaryFiles])
              .filter((file: string) =>
                /\.(woff|woff2|eot|ttf|otf)$/.test(file)
              )

            if (!fontLoaderManifest.pagesUsingSizeAdjust) {
              fontLoaderManifest.pagesUsingSizeAdjust = fontFiles.some((file) =>
                file.includes('-s')
              )
            }

            // Font files ending with .p.(woff|woff2|eot|ttf|otf) are preloaded
            const preloadedFontFiles: string[] = fontFiles.filter(
              (file: string) => /\.p.(woff|woff2|eot|ttf|otf)$/.test(file)
            )

            // Create an entry for the path even if no files should preload. If that's the case a preconnect tag is added.
            if (fontFiles.length > 0) {
              fontLoaderManifest.pages[pagePath] = preloadedFontFiles
            }
          }

          const manifest = JSON.stringify(fontLoaderManifest, null, 2)
          assets[`server/${FONT_LOADER_MANIFEST}.js`] = new sources.RawSource(
            `self.__FONT_LOADER_MANIFEST=${manifest}`
          )
          assets[`server/${FONT_LOADER_MANIFEST}.json`] = new sources.RawSource(
            manifest
          )
        }
      )
    })
    return
  }
}
