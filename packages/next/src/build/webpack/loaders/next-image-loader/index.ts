import { traceLocalSpan } from '../../../../server/lib/trace/local-span-recorder'
import type { CompilerNameValues } from '../../../../shared/lib/constants'

import path from 'path'
import loaderUtils from 'next/dist/compiled/loader-utils3'
import { getImageSize } from '../../../../server/image-optimizer/get-image-size'
import { getBlurImage } from './blur'

interface Options {
  compilerType: CompilerNameValues
  isDev: boolean
  assetPrefix: string
  basePath: string
  outputHashSalt: string
}

function nextImageLoader(this: any, content: Buffer) {
  return traceLocalSpan(
    {
      name: 'next-image-loader',
      parent: this.currentTraceSpan,
    },
    async (imageLoaderSpan) => {
      const options: Options = this.getOptions()
      const { compilerType, isDev, assetPrefix, basePath, outputHashSalt } =
        options
      const context = this.rootContext

      // Prepend the hash salt to the content for filename hash computation, so
      // that NEXT_HASH_SALT causes image filenames to change (like it does for
      // chunks). The actual file content is unaffected.
      const contentForHash = outputHashSalt
        ? Buffer.concat([Buffer.from(outputHashSalt, 'utf8'), content])
        : content
      const opts = { context, content: contentForHash }
      const interpolatedName = loaderUtils.interpolateName(
        this,
        '/static/media/[name].[hash:8].[ext]',
        opts
      )
      const outputPath = assetPrefix + '/_next' + interpolatedName
      let extension = loaderUtils.interpolateName(this, '[ext]', opts)
      if (extension === 'jpg') {
        extension = 'jpeg'
      }

      const imageSize = await traceLocalSpan(
        {
          name: 'image-size-calculation',
          parent: imageLoaderSpan,
        },
        () => getImageSize(content).catch((err) => err)
      )

      if (imageSize instanceof Error) {
        const err = imageSize
        err.name = 'InvalidImageFormatError'
        throw err
      }

      const {
        dataURL: blurDataURL,
        width: blurWidth,
        height: blurHeight,
      } = await getBlurImage(content, extension, imageSize, {
        basePath,
        outputPath,
        isDev,
        parentSpan: imageLoaderSpan,
      })

      const stringifiedData = traceLocalSpan(
        {
          name: 'image-data-stringify',
          parent: imageLoaderSpan,
          synchronous: true,
        },
        () =>
          JSON.stringify({
            src: outputPath,
            height: imageSize.height,
            width: imageSize.width,
            blurDataURL,
            blurWidth,
            blurHeight,
          })
      )

      if (compilerType === 'client') {
        this.emitFile(interpolatedName, content, null)
      } else {
        this.emitFile(
          path.join(
            '..',
            isDev || compilerType === 'edge-server' ? '' : '..',
            interpolatedName
          ),
          content,
          null
        )
      }

      return `export default ${stringifiedData};`
    }
  )
}
export const raw = true
export default nextImageLoader
