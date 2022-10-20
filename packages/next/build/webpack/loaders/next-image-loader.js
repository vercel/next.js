import loaderUtils from 'next/dist/compiled/loader-utils3'
import { resizeImage, getImageSize } from '../../../server/image-optimizer'

const BLUR_IMG_SIZE = 8
const BLUR_QUALITY = 70
const VALID_BLUR_EXT = ['jpeg', 'png', 'webp', 'avif'] // should match next/client/image.tsx

function nextImageLoader(content) {
  const imageLoaderSpan = this.currentTraceSpan.traceChild('next-image-loader')
  return imageLoaderSpan.traceAsyncFn(async () => {
    const { isServer, isDev, assetPrefix, basePath } = this.getOptions()
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

    let blurDataURL
    let blurWidth
    let blurHeight

    if (VALID_BLUR_EXT.includes(extension)) {
      // Shrink the image's largest dimension
      if (imageSize.width >= imageSize.height) {
        blurWidth = BLUR_IMG_SIZE
        blurHeight = Math.max(
          Math.round((imageSize.height / imageSize.width) * BLUR_IMG_SIZE),
          1
        )
      } else {
        blurWidth = Math.max(
          Math.round((imageSize.width / imageSize.height) * BLUR_IMG_SIZE),
          1
        )
        blurHeight = BLUR_IMG_SIZE
      }

      if (isDev) {
        // During `next dev`, we don't want to generate blur placeholders with webpack
        // because it can delay starting the dev server. Instead, we inline a
        // special url to lazily generate the blur placeholder at request time.
        const prefix = 'http://localhost'
        const url = new URL(`${basePath || ''}/_next/image`, prefix)
        url.searchParams.set('url', outputPath)
        url.searchParams.set('w', blurWidth)
        url.searchParams.set('q', BLUR_QUALITY)
        blurDataURL = url.href.slice(prefix.length)
      } else {
        const resizeImageSpan = imageLoaderSpan.traceChild('image-resize')
        const resizedImage = await resizeImageSpan.traceAsyncFn(() =>
          resizeImage(content, blurWidth, blurHeight, extension, BLUR_QUALITY)
        )
        const blurDataURLSpan = imageLoaderSpan.traceChild(
          'image-base64-tostring'
        )
        blurDataURL = blurDataURLSpan.traceFn(
          () =>
            `data:image/${extension};base64,${resizedImage.toString('base64')}`
        )
      }
    }

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

    if (!isServer) {
      this.emitFile(interpolatedName, content, null)
    }

    return `export default ${stringifiedData};`
  })
}
export const raw = true
export default nextImageLoader
