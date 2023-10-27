import { webpack, sources } from 'next/dist/compiled/webpack/webpack'
import getRouteFromEntrypoint from '../../../server/get-route-from-entrypoint'
import { NEXT_FONT_MANIFEST } from '../../../shared/lib/constants'
import { traverseModules } from '../utils'
import path from 'path'

export type NextFontManifest = {
  pages: {
    [path: string]: string[]
  }
  app: {
    [entry: string]: string[]
  }
  appUsingSizeAdjust: boolean
  pagesUsingSizeAdjust: boolean
}
const PLUGIN_NAME = 'NextFontManifestPlugin'

/**
 * When calling font functions with next/font, you can specify if you'd like the font to be preloaded (true by default).
 * e.g.: const inter = Inter({ subsets: ['latin'], preload: true })
 *
 * In that case, next-font-loader will emit the font file as [name].p.[ext] instead of [name].[ext]
 * This function returns those files from an array that can include both preloaded and non-preloaded files.
 */
function getPreloadedFontFiles(fontFiles: string[]) {
  return fontFiles.filter((file: string) =>
    /\.p\.(woff|woff2|eot|ttf|otf)$/.test(file)
  )
}

/**
 * Similarly to getPreloadedFontFiles, but returns true if some of the files includes -s in the name.
 * This means that a font is using size adjust in its fallback font.
 * This was added to enable adding data-size-adjust="true" to the dom, used by the Google Aurora team to collect statistics.
 */
function getPageIsUsingSizeAdjust(fontFiles: string[]) {
  return fontFiles.some((file) => file.includes('-s'))
}

/**
 * The NextFontManifestPlugin collects all font files emitted by next-font-loader and creates a manifest file.
 * The manifest file is used in the Next.js render functions (_document.tsx for pages/ and app-render for app/) to add preload tags for the font files.
 * We only want to att preload fonts that are used by the current route.
 *
 * For pages/ the plugin finds the fonts imported in the entrypoint chunks and creates a map:
 * { [route]: fontFile[] }
 * When rendering the app in _document.tsx, it gets the font files to preload: manifest.pages[currentRouteBeingRendered].
 *
 * For app/, the manifest is a bit different.
 * Instead of creating a map of route to font files, it creates a map of the webpack module request to font files.
 * { [webpackModuleRequest]: fontFile[]]}
 * When creating the component tree in app-render it looks for font files to preload: manifest.app[moduleBeingRendered]
 */
export class NextFontManifestPlugin {
  private appDir: undefined | string

  constructor(options: { appDir: undefined | string }) {
    this.appDir = options.appDir
  }

  apply(compiler: webpack.Compiler) {
    compiler.hooks.make.tap(PLUGIN_NAME, (compilation) => {
      // In this stage the font files are emitted and we can collect all files emitted by each chunkGroup (entry).
      compilation.hooks.processAssets.tap(
        {
          name: PLUGIN_NAME,
          stage: webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONS,
        },
        (assets: any) => {
          const nextFontManifest: NextFontManifest = {
            pages: {},
            app: {},
            appUsingSizeAdjust: false,
            pagesUsingSizeAdjust: false,
          }

          if (this.appDir) {
            const appDirBase = path.dirname(this.appDir) + path.sep

            // After all modules are created, we collect the modules that was created by next-font-loader.
            traverseModules(
              compilation,
              (mod, _chunk, chunkGroup) => {
                if (mod?.request?.includes('/next-font-loader/index.js?')) {
                  if (!mod.buildInfo?.assets) return

                  const chunkEntryName = (appDirBase + chunkGroup.name).replace(
                    /[\\/]/g,
                    path.sep
                  )

                  const modAssets = Object.keys(mod.buildInfo.assets)
                  const fontFiles: string[] = modAssets.filter((file: string) =>
                    /\.(woff|woff2|eot|ttf|otf)$/.test(file)
                  )

                  // Look if size-adjust fallback font is being used
                  if (!nextFontManifest.appUsingSizeAdjust) {
                    nextFontManifest.appUsingSizeAdjust =
                      getPageIsUsingSizeAdjust(fontFiles)
                  }

                  const preloadedFontFiles = getPreloadedFontFiles(fontFiles)

                  // Add an entry of the module's font files in the manifest.
                  // We'll add an entry even if no files should preload.
                  // When an entry is present but empty, instead of preloading the font files, a preconnect tag is added.
                  if (fontFiles.length > 0) {
                    if (!nextFontManifest.app[chunkEntryName]) {
                      nextFontManifest.app[chunkEntryName] = []
                    }
                    nextFontManifest.app[chunkEntryName].push(
                      ...preloadedFontFiles
                    )
                  }
                }
              },
              (chunkGroup) => {
                // Only loop through entrypoints that are under app/.
                return !!chunkGroup.name?.startsWith('app/')
              }
            )
          }

          // Look at all the entrypoints created for pages/.
          for (const entrypoint of compilation.entrypoints.values()) {
            const pagePath = getRouteFromEntrypoint(entrypoint.name!)

            if (!pagePath) {
              continue
            }

            // Get font files from the chunks included in the entrypoint.
            const fontFiles: string[] = entrypoint.chunks
              .flatMap((chunk: any) => [...chunk.auxiliaryFiles])
              .filter((file: string) =>
                /\.(woff|woff2|eot|ttf|otf)$/.test(file)
              )

            // Look if size-adjust fallback font is being used
            if (!nextFontManifest.pagesUsingSizeAdjust) {
              nextFontManifest.pagesUsingSizeAdjust =
                getPageIsUsingSizeAdjust(fontFiles)
            }

            const preloadedFontFiles = getPreloadedFontFiles(fontFiles)

            // Add an entry of the route's font files in the manifest.
            // We'll add an entry even if no files should preload.
            // When an entry is present but empty, instead of preloading the font files, a preconnect tag is added.
            if (fontFiles.length > 0) {
              nextFontManifest.pages[pagePath] = preloadedFontFiles
            }
          }

          const manifest = JSON.stringify(nextFontManifest, null)
          // Create manifest for edge
          assets[`server/${NEXT_FONT_MANIFEST}.js`] = new sources.RawSource(
            `self.__NEXT_FONT_MANIFEST=${JSON.stringify(manifest)}`
          )
          // Create manifest for server
          assets[`server/${NEXT_FONT_MANIFEST}.json`] = new sources.RawSource(
            manifest
          )
        }
      )
    })
    return
  }
}
