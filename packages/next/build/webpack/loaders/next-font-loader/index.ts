import type { FontLoader } from '../../../../font'

import { promises as fs } from 'fs'
import path from 'path'
import loaderUtils from 'next/dist/compiled/loader-utils3'
import postcssFontLoaderPlugn from './postcss-font-loader'
import { promisify } from 'util'
import chalk from 'next/dist/compiled/chalk'
import { CONFIG_FILES } from '../../../../shared/lib/constants'

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

    // next-swc next_font_loaders turns each font loader call into JSON
    const {
      path: relativeFilePathFromRoot,
      import: functionName,
      arguments: data,
    } = JSON.parse(this.resourceQuery.slice(1))

    try {
      const fontLoader: FontLoader = require(path.join(
        this.resourcePath,
        '../loader.js'
      )).default
      let { css, fallbackFonts, adjustFontFallback, weight, style, variable } =
        await fontLoader({
          functionName,
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
          fs: this.fs,
          isServer,
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
        postcssFontLoaderPlugn({
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
      err.stack = false
      err.message = `Font loader error:\n${err.message}`
      err.message += `

${chalk.cyan(`Location: ${relativeFilePathFromRoot}`)}`
      callback(err)
    }
  })
}
