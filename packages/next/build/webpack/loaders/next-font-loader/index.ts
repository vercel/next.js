import type { FontLoader } from '../../../../font'

import path from 'path'
import loaderUtils from 'next/dist/compiled/loader-utils3'
import postcssFontLoaderPlugn from './postcss-font-loader'
import { promisify } from 'util'
import chalk from 'next/dist/compiled/chalk'

export default async function nextFontLoader(this: any) {
  const fontLoaderSpan = this.currentTraceSpan.traceChild('next-font-loader')
  return fontLoaderSpan.traceAsyncFn(async () => {
    const callback = this.async()
    const {
      isServer,
      assetPrefix,
      fontLoaderOptions,
      postcss: getPostcss,
    } = this.getOptions()

    const emitFontFile = (content: Buffer, ext: string, preload: boolean) => {
      const opts = { context: this.rootContext, content }
      const interpolatedName = loaderUtils.interpolateName(
        this,
        // Font files ending with .p.(woff|woff2|eot|ttf|otf) are preloaded
        `static/media/[hash]${preload ? '.p' : ''}.${ext}`,
        opts
      )
      const outputPath = `${assetPrefix}/_next/${interpolatedName}`
      if (!isServer) {
        this.emitFile(interpolatedName, content, null)
      }
      return outputPath
    }

    // next-swc next_font_loaders turns each function call argument into JSON seperated by semicolons
    let [relativeFilePathFromRoot, functionName, ...data] = this.resourceQuery
      .slice(1)
      .split(';')
    data = data.map((value: string) => JSON.parse(value))

    try {
      const fontLoader: FontLoader = require(path.join(
        this.resourcePath,
        '../loader.js'
      )).default
      let { css, fallbackFonts } = await fontLoader({
        functionName,
        data,
        config: fontLoaderOptions,
        emitFontFile,
        resolve: (src: string) =>
          promisify(this.resolve)(
            path.dirname(path.join(this.rootContext, relativeFilePathFromRoot)),
            src
          ),
        fs: this.fs,
      })

      const { postcss } = await getPostcss()

      // Exports will be exported as is from css-loader instead of a CSS module export
      const exports: { name: any; value: any }[] = []
      const fontFamilyHash = loaderUtils.getHashDigest(
        Buffer.from(css),
        'md5',
        'hex',
        6
      )
      // Add CSS classes, exports and make the font-family localy scoped by turning it unguessable
      const result = await postcss(
        postcssFontLoaderPlugn(exports, fontFamilyHash, fallbackFonts)
      ).process(css, {
        from: undefined,
      })

      // Reuse ast in css-loader
      const ast = {
        type: 'postcss',
        version: result.processor.version,
        root: result.root,
      }
      callback(null, result.css, null, { exports, ast, fontFamilyHash })
    } catch (err: any) {
      err.stack = false
      err.message += `

${chalk.cyan(`Location: ${relativeFilePathFromRoot}`)}`
      callback(err)
    }
  })
}
