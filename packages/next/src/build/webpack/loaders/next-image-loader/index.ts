import loaderUtils from 'next/dist/compiled/loader-utils3'
import { getImageSize } from '../../../../server/image-optimizer'
import { getBlurImage } from './blur'

interface Options {
  isServer: boolean
  isDev: boolean
  assetPrefix: string
  basePath: string
}

function nextImageLoader(this: any, content: Buffer) {
  const imageLoaderSpan = this.currentTraceSpan.traceChild('next-image-loader')
  return imageLoaderSpan.traceAsyncFn(async () => {
    const options: Options = this.getOptions()
    const { isServer, isDev, assetPrefix, basePath } = options
    const context = this.rootContext

    const opts = { context, content }
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

    const imageSizeSpan = imageLoaderSpan.traceChild('image-size-calculation')
    const imageSize = await imageSizeSpan.traceAsyncFn(() =>
      getImageSize(content, extension).catch((err) => err)
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
      tracing: imageLoaderSpan.traceChild.bind(imageLoaderSpan),
    })

    const stringifiedData = imageLoaderSpan
      .traceChild('image-data-stringify')
      .traceFn(() =>
        JSON.stringify({
          src: outputPath,
          height: imageSize.height,
          width: imageSize.width,
          blurDataURL,
          blurWidth,
          blurHeight,
        })
      )

    if (isServer) {
      this.emitFile(
        `../${isDev ? '' : '../'}${interpolatedName}`,
        content,
        null
      )
    } else {
      this.emitFile(interpolatedName, content, null)
    }

    return `export default ${stringifiedData};`
  })
}
export const raw = true
export default nextImageLoader
