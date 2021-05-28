import loaderUtils from 'next/dist/compiled/loader-utils'
import sizeOf from 'image-size'
import { processBuffer } from '../../../next-server/server/lib/squoosh/main'
import fs from 'fs'

const PLACEHOLDER_SIZE = 6

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

  const imageSize = sizeOf(this.resourcePath)
  let placeholder
  const fileBuffer = Buffer.from(fs.readFileSync(this.resourcePath))
  if (extension === 'jpeg' || extension === 'png') {
    // Shrink the image's largest dimension to 6 pixels
    const resizeOperationOpts =
      imageSize.width >= imageSize.height
        ? { type: 'resize', width: PLACEHOLDER_SIZE }
        : { type: 'resize', height: PLACEHOLDER_SIZE }
    const resizedImage = await processBuffer(
      fileBuffer,
      [resizeOperationOpts],
      extension,
      0
    )
    placeholder = `data:image/${extension};base64,${resizedImage.toString(
      'base64'
    )}`
  }

  const stringifiedData = JSON.stringify({
    src: '/_next' + interpolatedName,
    height: imageSize.height,
    width: imageSize.width,
    placeholder,
  })

  this.emitFile(interpolatedName, fileBuffer, null)

  return `${'export default '} ${stringifiedData};`
}
nextImageLoader.raw = true
export default nextImageLoader
