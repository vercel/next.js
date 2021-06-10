import loaderUtils from 'next/dist/compiled/loader-utils'
import sizeOf from 'image-size'
import { processBuffer } from '../../../next-server/server/lib/squoosh/main'

const BLUR_IMG_SIZE = 8
const BLUR_QUALITY = 70
const VALID_BLUR_EXT = ['jpeg', 'png', 'webp']

async function nextImageLoader(content) {
  const context = this.rootContext
  const opts = { context, content }
  const interpolatedName = loaderUtils.interpolateName(
    this,
    '/static/image/[path][name].[hash].[ext]',
    opts
  )

  let extension = loaderUtils.interpolateName(this, '[ext]', opts)
  if (extension === 'jpg') {
    extension = 'jpeg'
  }

  const imageSize = sizeOf(content)
  let blurDataURL
  if (VALID_BLUR_EXT.includes(extension)) {
    // Shrink the image's largest dimension
    const resizeOperationOpts =
      imageSize.width >= imageSize.height
        ? { type: 'resize', width: BLUR_IMG_SIZE }
        : { type: 'resize', height: BLUR_IMG_SIZE }
    const resizedImage = await processBuffer(
      content,
      [resizeOperationOpts],
      extension,
      BLUR_QUALITY
    )
    blurDataURL = `data:image/${extension};base64,${resizedImage.toString(
      'base64'
    )}`
  }

  const stringifiedData = JSON.stringify({
    src: '/_next' + interpolatedName,
    height: imageSize.height,
    width: imageSize.width,
    blurDataURL,
  })

  this.emitFile(interpolatedName, content, null)

  return `${'export default '} ${stringifiedData};`
}
export const raw = true
export default nextImageLoader
