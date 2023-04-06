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
  segment: string
  type: PossibleImageFileNameConvention
  pageExtensions: string[]
}

async function nextMetadataImageLoader(this: any, content: Buffer) {
  const options: Options = this.getOptions()
  const { type, route, segment, pageExtensions } = options
  const numericSizes = type === 'twitter' || type === 'openGraph'
  const { resourcePath, rootContext: context } = this
  const { name: fileNameBase, ext } = path.parse(resourcePath)

  let extension = ext.slice(1)
  if (extension === 'jpg') {
    extension = 'jpeg'
  }

  const opts = { context, content }

  // No hash query for favicon.ico
  const contentHash =
    type === 'favicon'
      ? ''
      : loaderUtils.interpolateName(this, '[contenthash]', opts)

  const interpolatedName = loaderUtils.interpolateName(
    this,
    '[name].[ext]',
    opts
  )

  const isDynamicResource = pageExtensions.includes(extension)
  const pageRoute = isDynamicResource ? fileNameBase : interpolatedName
  const hashQuery = contentHash ? '?' + contentHash : ''

  if (isDynamicResource) {
    // re-export and spread as `exportedImageData` to avoid non-exported error
    return `\
    import path from 'next/dist/shared/lib/isomorphic/path'
    import * as exported from ${JSON.stringify(resourcePath)}
    import { interpolateDynamicPath } from 'next/dist/server/server-utils'
    import { getNamedRouteRegex } from 'next/dist/shared/lib/router/utils/route-regex'
    import { getMetadataRouteSuffix } from 'next/dist/lib/metadata/get-metadata-route'

    const exportedImageData = { ...exported }
    export default (props) => {
      const pathname = ${JSON.stringify(route)}
      const routeRegex = getNamedRouteRegex(pathname, false)
      const segment = ${JSON.stringify(segment)}
      const route = interpolateDynamicPath(pathname, props.params, routeRegex)
      const suffix = getMetadataRouteSuffix(segment)
      const routeSuffix = suffix ? \`-\${suffix}\` : ''

      const imageData = {
        alt: exportedImageData.alt,
        type: exportedImageData.contentType || 'image/png',
        url: path.join(route, ${JSON.stringify(
          pageRoute
        )} + routeSuffix + ${JSON.stringify(hashQuery)}),
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

  const imageData: Omit<MetadataImageModule, 'url'> = {
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

  return `\
  import path from 'next/dist/shared/lib/isomorphic/path'
  import { interpolateDynamicPath } from 'next/dist/server/server-utils'
  import { getNamedRouteRegex } from 'next/dist/shared/lib/router/utils/route-regex'

  export default (props) => {
    const pathname = ${JSON.stringify(route)}
    const routeRegex = getNamedRouteRegex(pathname, false)
    const route = interpolateDynamicPath(pathname, props.params, routeRegex)

    const imageData = ${JSON.stringify(imageData)};

    return {
      ...imageData,
      url: path.join(route, ${JSON.stringify(pageRoute)} + ${JSON.stringify(
    hashQuery
  )}),
    }
  }`
}

export const raw = true
export default nextMetadataImageLoader
