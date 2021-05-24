import loaderUtils from 'next/dist/compiled/loader-utils'
import sizeOf from 'image-size'
import { processBuffer } from '../../../next-server/server/lib/squoosh/main'
import fs from 'fs'

async function nextImageLoader(content) {
  this.cacheable && this.cacheable(true)
  this.addDependency(this.resourcePath)

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
  let dataURI
  if (extension === 'jpeg' || extension === 'png') {
    const fileBuffer = Buffer.from(fs.readFileSync(this.resourcePath))
    const resizedImage = await processBuffer(
      fileBuffer,
      [{ type: 'resize', width: 6 }],
      extension,
      0
    )
    dataURI = `data:image/${extension};base64,${resizedImage.toString(
      'base64'
    )}`
  }

  const stringifiedData = JSON.stringify({
    src,
    height: imageSize.height,
    width: imageSize.width,
    dataURI,
  })

  return `${'export default '} ${stringifiedData};`
}

export default nextImageLoader
