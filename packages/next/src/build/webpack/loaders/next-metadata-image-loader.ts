/*
 * This loader is responsible for extracting the metadata image info for rendering in html
 */

import type {
  MetadataImageModule,
  PossibleImageFileNameConvention,
} from './metadata/types'
import fs from 'fs/promises'
import path from 'path'
import loaderUtils from 'next/dist/compiled/loader-utils3'
import { getImageSize } from '../../../server/image-optimizer'
import { imageExtMimeTypeMap } from '../../../lib/mime-type'
import { fileExists } from '../../../lib/file-exists'

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

    const imageModule = { ...exported }
    export default async function (props) {
      const pathname = ${JSON.stringify(route)}
      const routeRegex = getNamedRouteRegex(pathname, false)
      const segment = ${JSON.stringify(segment)}
      const { __metadata_id__: _, ...params } = props.params
      const route = interpolateDynamicPath(pathname, params, routeRegex)
      const suffix = getMetadataRouteSuffix(segment)
      const routeSuffix = suffix ? \`-\${suffix}\` : ''
      const imageRoute = ${JSON.stringify(pageRoute)} + routeSuffix

      const { generateImageMetadata } = imageModule

      function getImageMetadata(imageMetadata, segment) {
        const data = {
          alt: imageMetadata.alt,
          type: imageMetadata.contentType || 'image/png',
          url: path.join(route, segment + ${JSON.stringify(hashQuery)}),
        }
        const { size } = imageMetadata
        if (size) {
          ${
            type === 'twitter' || type === 'openGraph'
              ? 'data.width = size.width; data.height = size.height;'
              : 'data.sizes = size.width + "x" + size.height;'
          }
        }
        return data
      }

      if (generateImageMetadata) {
        const imageMetadataArray = await generateImageMetadata({ params })
        return imageMetadataArray.map((imageMetadata, index) => {
          const segment = path.join(imageRoute, (imageMetadata.id || index) + '')
          return getImageMetadata(imageMetadata, segment)
        })
      } else {
        return [getImageMetadata(imageModule, imageRoute)]
      }
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
  if (type === 'openGraph' || type === 'twitter') {
    const altPath = path.join(
      path.dirname(resourcePath),
      fileNameBase + '.alt.txt'
    )

    if (await fileExists(altPath)) {
      imageData.alt = await fs.readFile(altPath, 'utf8')
    }
  }

  return `\
  import path from 'next/dist/shared/lib/isomorphic/path'
  import { interpolateDynamicPath } from 'next/dist/server/server-utils'
  import { getNamedRouteRegex } from 'next/dist/shared/lib/router/utils/route-regex'
  import { getMetadataRouteSuffix } from 'next/dist/lib/metadata/get-metadata-route'

  export default (props) => {
    const pathname = ${JSON.stringify(route)}
    const routeRegex = getNamedRouteRegex(pathname, false)
    const segment = ${JSON.stringify(segment)}
    const route = interpolateDynamicPath(pathname, props.params, routeRegex)
    const suffix = getMetadataRouteSuffix(segment)
    const routeSuffix = suffix ? \`-\${suffix}\` : ''
    const { name, ext } = path.parse(${JSON.stringify(pageRoute)})

    const imageData = ${JSON.stringify(imageData)};

    return [{
      ...imageData,
      url: path.join(route, name + routeSuffix + ext + ${JSON.stringify(
        type === 'favicon' ? '' : hashQuery
      )}),
    }]
  }`
}

export const raw = true
export default nextMetadataImageLoader
