/*
 * This loader is responsible for extracting the metadata image info for rendering in html
 */

import type {
  MetadataImageModule,
  PossibleImageFileNameConvention,
} from './metadata/types'
import path from 'path'
import loaderUtils from 'next/dist/compiled/loader-utils3'
import { getImageSize } from '../../../server/image-optimizer'
import { imageExtMimeTypeMap } from '../../../lib/mime-type'

interface Options {
  route: string
  type: PossibleImageFileNameConvention
  pageExtensions: string[]
}

async function nextMetadataImageLoader(this: any, content: Buffer) {
  const options: Options = this.getOptions()
  const { type, route, pageExtensions } = options
  const numericSizes = type === 'twitter' || type === 'openGraph'
  const { resourcePath, rootContext: context } = this
  const { name: filename, ext } = path.parse(resourcePath)

  let extension = ext.slice(1)
  if (extension === 'jpg') {
    extension = 'jpeg'
  }

  const opts = { context, content }

  const interpolatedName = loaderUtils.interpolateName(
    this,
    '[name].[ext]',
    opts
  )

  // No hash query for favicon.ico
  const contentHash =
    type === 'favicon'
      ? ''
      : loaderUtils.interpolateName(this, '[contenthash]', opts)

  const outputPath =
    route + '/' + interpolatedName + (contentHash ? `?${contentHash}` : '')

  const isDynamicResource = pageExtensions.includes(extension)
  if (isDynamicResource) {
    // re-export and spread as `exportedImageData` to avoid non-exported error
    return `\
    import * as exported from ${JSON.stringify(resourcePath)}
    import { interpolateDynamicPath } from 'next/dist/server/server-utils'
    import { getNamedRouteRegex } from 'next/dist/shared/lib/router/utils/route-regex'

    const exportedImageData = { ...exported }
    export default (props) => {
      const pathname = ${JSON.stringify(route)}
      const routeRegex = getNamedRouteRegex(pathname)
      const route = interpolateDynamicPath(pathname, props.params, routeRegex)

      const imageData = {
        alt: exportedImageData.alt,
        type: exportedImageData.contentType,
        url: route + '/' + ${JSON.stringify(
          filename + (contentHash ? '?' + contentHash : '')
        )},
      }
      const { size } = exportedImageData
      if (size) {
        ${
          type === 'twitter' || type === 'openGraph'
            ? 'imageData.width = size.width; imageData.height = size.height;'
            : 'imageData.sizes = size.width + "x" + size.height;'
        }
      }
      return imageData
    }`
  }

  const imageSize = await getImageSize(
    content,
    extension as 'avif' | 'webp' | 'png' | 'jpeg'
  ).catch((err) => err)

  if (imageSize instanceof Error) {
    const err = imageSize
    err.name = 'InvalidImageFormatError'
    throw err
  }

  const imageData: MetadataImageModule = {
    url: outputPath,
    ...(extension in imageExtMimeTypeMap && {
      type: imageExtMimeTypeMap[extension as keyof typeof imageExtMimeTypeMap],
    }),
    ...(numericSizes
      ? { width: imageSize.width as number, height: imageSize.height as number }
      : {
          sizes:
            extension === 'ico'
              ? 'any'
              : `${imageSize.width}x${imageSize.height}`,
        }),
  }

  const stringifiedData = JSON.stringify(imageData)

  return `export default ${stringifiedData};`
}

export const raw = true
export default nextMetadataImageLoader
