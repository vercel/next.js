import type { FontLoader } from '../../../../../font'

import { promises as fs } from 'fs'
import path from 'path'
import chalk from 'next/dist/compiled/chalk'
import loaderUtils from 'next/dist/compiled/loader-utils3'
import postcssNextFontPlugin from './postcss-next-font'
import { promisify } from 'util'
import { CONFIG_FILES } from '../../../../shared/lib/constants'

export default async function nextFontLoader(this: any) {
  const fontLoaderSpan = this.currentTraceSpan.traceChild('next-font-loader')
  return fontLoaderSpan.traceAsyncFn(async () => {
    const callback = this.async()

    // next-swc next_font_loaders turns each font loader call into JSON
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
      fontLoaderOptions,
      postcss: getPostcss,
    } = this.getOptions()

    const nextConfigPaths = CONFIG_FILES.map((config) =>
      path.join(this.rootContext, config)
    )
    // Add next.config.js as a dependency, loaders must rerun in case options changed
    await Promise.all(
      nextConfigPaths.map(async (configPath) => {
        const hasConfig = await fs.access(configPath).then(
          () => true,
          () => false
        )
        if (hasConfig) {
          this.addDependency(configPath)
        } else {
          this.addMissingDependency(configPath)
        }
      })
    )

    const emitFontFile = (
      content: Buffer,
      ext: string,
      preload: boolean,
      isUsingSizeAdjust?: boolean
    ) => {
      const opts = { context: this.rootContext, content }
      const interpolatedName = loaderUtils.interpolateName(
        this,
        // Font files ending with .p.(woff|woff2|eot|ttf|otf) are preloaded
        `static/media/[hash]${isUsingSizeAdjust ? '-s' : ''}${
          preload ? '.p' : ''
        }.${ext}`,
        opts
      )
      const outputPath = `${assetPrefix}/_next/${interpolatedName}`
      if (!isServer) {
        this.emitFile(interpolatedName, content, null)
      }
      return outputPath
    }

    try {
      const fontLoader: FontLoader = require(fontLoaderPath).default
      let { css, fallbackFonts, adjustFontFallback, weight, style, variable } =
        await fontLoader({
          functionName,
          variableName,
          data,
          config: fontLoaderOptions,
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
      const fontFamilyHash = loaderUtils.getHashDigest(
        Buffer.from(css),
        'md5',
        'hex',
        6
      )
      // Add CSS classes, exports and make the font-family localy scoped by turning it unguessable
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

      // Reuse ast in css-loader
      const ast = {
        type: 'postcss',
        version: result.processor.version,
        root: result.root,
      }
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
