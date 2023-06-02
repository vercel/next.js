import type { FontLoader } from '../../../../../font'

import path from 'path'
import chalk from 'next/dist/compiled/chalk'
import loaderUtils from 'next/dist/compiled/loader-utils3'
import postcssNextFontPlugin from './postcss-next-font'
import { promisify } from 'util'

export default async function nextFontLoader(this: any) {
  const nextFontLoaderSpan =
    this.currentTraceSpan.traceChild('next-font-loader')
  return nextFontLoaderSpan.traceAsyncFn(async () => {
    const callback = this.async()

    /**
     * The next-swc plugin next-transform-font turns font function calls into CSS imports.
     * At the end of the import, it adds the call arguments and some additional data as a resourceQuery.
     * e.g:
     * const inter = Inter({ subset: ['latin'] })
     * ->
     * import inter from 'next/font/google/target.css?{"import":"Inter","subsets":["latin"]}'
     *
     * Here we parse the resourceQuery to get the font function name, call arguments, and the path to the file that called the font function.
     */
    const {
      path: relativeFilePathFromRoot,
      import: functionName,
      arguments: data,
      variableName,
    } = JSON.parse(this.resourceQuery.slice(1))

    // Throw error if @next/font is used in _document.js
    if (/pages[\\/]_document\./.test(relativeFilePathFromRoot)) {
      const err = new Error(
        `${chalk.bold('Cannot')} be used within ${chalk.cyan(
          'pages/_document.js'
        )}.`
      )
      err.name = 'NextFontError'
      callback(err)
      return
    }

    const {
      isDev,
      isServer,
      assetPrefix,
      fontLoaderPath,
      postcss: getPostcss,
    } = this.getOptions()

    if (assetPrefix && !/^\/|https?:\/\//.test(assetPrefix)) {
      const err = new Error(
        'assetPrefix must start with a leading slash or be an absolute URL(http:// or https://)'
      )
      err.name = 'NextFontError'
      callback(err)
      return
    }

    /**
     * Emit font files to .next/static/media as [hash].[ext].
     *
     * If the font should be preloaded, add .p to the filename: [hash].p.[ext]
     * NextFontManifestPlugin adds these files to the next/font manifest.
     *
     * If the font is using a size-adjust fallback font, add -s to the filename: [hash]-s.[ext]
     * NextFontManifestPlugin uses this to see if fallback fonts are being used.
     * This is used to collect stats on fallback fonts usage by the Google Aurora team.
     */
    const emitFontFile = (
      content: Buffer,
      ext: string,
      preload: boolean,
      isUsingSizeAdjust?: boolean
    ) => {
      const opts = { context: this.rootContext, content }
      const interpolatedName = loaderUtils.interpolateName(
        this,
        `static/media/[hash]${isUsingSizeAdjust ? '-s' : ''}${
          preload ? '.p' : ''
        }.${ext}`,
        opts
      )
      const outputPath = `${assetPrefix}/_next/${interpolatedName}`
      // Only the client emits the font file
      if (!isServer) {
        this.emitFile(interpolatedName, content, null)
      }
      // But both the server and client must get the resulting path
      return outputPath
    }

    try {
      // Import the font loader function from either next/font/local or next/font/google
      // The font loader function emits font files and returns @font-faces and fallback font metrics
      const fontLoader: FontLoader = require(fontLoaderPath).default
      let { css, fallbackFonts, adjustFontFallback, weight, style, variable } =
        await fontLoader({
          functionName,
          variableName,
          data,
          emitFontFile,
          resolve: (src: string) =>
            promisify(this.resolve)(
              path.dirname(
                path.join(this.rootContext, relativeFilePathFromRoot)
              ),
              src.startsWith('.') ? src : `./${src}`
            ),
          isDev,
          isServer,
          loaderContext: this,
        })

      const { postcss } = await getPostcss()

      // Exports will be exported as is from css-loader instead of a CSS module export
      const exports: { name: any; value: any }[] = []

      // Generate a hash from the CSS content. Used to generate classnames and font families
      const fontFamilyHash = loaderUtils.getHashDigest(
        Buffer.from(css),
        'md5',
        'hex',
        6
      )

      // Add CSS classes, exports and make the font-family locally scoped by turning it unguessable
      const result = await postcss(
        postcssNextFontPlugin({
          exports,
          fontFamilyHash,
          fallbackFonts,
          weight,
          style,
          adjustFontFallback,
          variable,
        })
      ).process(css, {
        from: undefined,
      })

      const ast = {
        type: 'postcss',
        version: result.processor.version,
        root: result.root,
      }

      // Return the resulting CSS and send the postcss ast, font exports and the hash to the css-loader in the meta argument.
      callback(null, result.css, null, {
        exports,
        ast,
        fontFamilyHash,
      })
    } catch (err: any) {
      callback(err)
    }
  })
}
