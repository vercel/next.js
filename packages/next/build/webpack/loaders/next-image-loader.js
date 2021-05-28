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
    '/[path][name].[ext]',
    opts
  )

  let extension = loaderUtils.interpolateName(this, '[ext]', opts)
  if (extension === 'jpg') {
    extension = 'jpeg'
  }

  if (interpolatedName.slice(0, 7) !== '/public') {
    const err = new Error(
      'Static Image loader used with filepath not in the /public directory: ' +
        interpolatedName
    )
    this.emitError(err)
    return
  }

  const src = interpolatedName.slice(7)
  const imageSize = sizeOf(this.resourcePath)
  let placeholder
  if (extension === 'jpeg' || extension === 'png') {
    const fileBuffer = Buffer.from(fs.readFileSync(this.resourcePath))
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
    src,
    height: imageSize.height,
    width: imageSize.width,
    placeholder,
  })

  return `${'export default '} ${stringifiedData};`
}

export default nextImageLoader
