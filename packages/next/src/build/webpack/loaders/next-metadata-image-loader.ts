/*
 * This loader is responsible for extracting the metadata image info for rendering in html
 */

import type webpack from 'webpack'
import type {
  MetadataImageModule,
  PossibleImageFileNameConvention,
} from './metadata/types'
import { existsSync, promises as fs } from 'fs'
import path from 'path'
import loaderUtils from 'next/dist/compiled/loader-utils3'
import { getImageSize } from '../../../server/image-optimizer'
import { imageExtMimeTypeMap } from '../../../lib/mime-type'
import { WEBPACK_RESOURCE_QUERIES } from '../../../lib/constants'
import { normalizePathSep } from '../../../shared/lib/page-path/normalize-path-sep'
import type { PageExtensions } from '../../page-extensions-type'
import { getLoaderModuleNamedExports } from './utils'

interface Options {
  segment: string
  type: PossibleImageFileNameConvention
  pageExtensions: PageExtensions
  basePath: string
}

// [NOTE] For turbopack, refer to app_page_loader_tree's write_metadata_item for
// corresponding features.
async function nextMetadataImageLoader(
  this: webpack.LoaderContext<Options>,
  content: Buffer
) {
  const options: Options = this.getOptions()
  const { type, segment, pageExtensions, basePath } = options
  const { resourcePath, rootContext: context } = this
  const { name: fileNameBase, ext } = path.parse(resourcePath)
  const useNumericSizes = type === 'twitter' || type === 'openGraph'

  let extension = ext.slice(1)
  if (extension === 'jpg') {
    extension = 'jpeg'
  }

  const opts = { context, content }

  const contentHash = loaderUtils.interpolateName(this, '[contenthash]', opts)

  const interpolatedName = loaderUtils.interpolateName(
    this,
    '[name].[ext]',
    opts
  )

  const isDynamicResource = pageExtensions.includes(extension)
  const pageSegment = isDynamicResource ? fileNameBase : interpolatedName
  const hashQuery = contentHash ? '?' + contentHash : ''
  const pathnamePrefix = normalizePathSep(path.join(basePath, segment))

  if (isDynamicResource) {
    const exportedFieldsExcludingDefault = (
      await getLoaderModuleNamedExports(resourcePath, this)
    ).filter((name) => name !== 'default')

    // re-export and spread as `exportedImageData` to avoid non-exported error
    return `\
    import {
      ${exportedFieldsExcludingDefault
        .map((field) => `${field} as _${field}`)
        .join(',')}
    } from ${JSON.stringify(
      // This is an arbitrary resource query to ensure it's a new request, instead
      // of sharing the same module with next-metadata-route-loader.
      // Since here we only need export fields such as `size`, `alt` and
      // `generateImageMetadata`, avoid sharing the same module can make this entry
      // smaller.
      resourcePath + '?' + WEBPACK_RESOURCE_QUERIES.metadataImageMeta
    )}
    import { fillMetadataSegment } from 'next/dist/lib/metadata/get-metadata-route'

    const imageModule = {
      ${exportedFieldsExcludingDefault
        .map((field) => `${field}: _${field}`)
        .join(',')}
    }

    function getImageMetadata(imageMetadata, idParam, resolvedParams) {
      const imageUrl = fillMetadataSegment(${JSON.stringify(
        pathnamePrefix
      )}, resolvedParams, ${JSON.stringify(pageSegment)})
      const data = {
        alt: imageMetadata.alt,
        type: imageMetadata.contentType || 'image/png',
      url: imageUrl + (idParam ? ('/' + idParam) : '') + ${JSON.stringify(
        hashQuery
      )},
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

    export default async function (props) {
      const { generateImageMetadata } = imageModule
      const resolvedParams = await props.params

      if (generateImageMetadata) {
        const imageMetadataArray = await generateImageMetadata({ params: resolvedParams })
        return imageMetadataArray.map((imageMetadata, index) => {
          const idParam = imageMetadata.id + ''
          return getImageMetadata(imageMetadata, idParam, resolvedParams)
        })
      } else {
        return [getImageMetadata(imageModule, '', resolvedParams)]
      }
    }`
  }

  let imageError
  const imageSize: { width?: number; height?: number } = await getImageSize(
    content
  ).catch((error) => {
    const message = `Process image "${path.posix.join(segment || '/', interpolatedName)}" failed: ${error}`
    imageError = new Error(message)
    return {}
  })

  if (imageError) {
    throw imageError
  }

  const imageData: Omit<MetadataImageModule, 'url'> = {
    ...(extension in imageExtMimeTypeMap && {
      type: imageExtMimeTypeMap[extension as keyof typeof imageExtMimeTypeMap],
    }),
    ...(useNumericSizes && imageSize.width != null && imageSize.height != null
      ? imageSize
      : {
          sizes:
            // For SVGs, skip sizes and use "any" to let it scale automatically based on viewport,
            // For the images doesn't provide the size properly, use "any" as well.
            // If the size is presented, use the actual size for the image.
            extension !== 'svg' &&
            imageSize.width != null &&
            imageSize.height != null
              ? `${imageSize.width}x${imageSize.height}`
              : 'any',
        }),
  }
  if (type === 'openGraph' || type === 'twitter') {
    const altPath = path.join(
      path.dirname(resourcePath),
      fileNameBase + '.alt.txt'
    )

    if (existsSync(altPath)) {
      imageData.alt = await fs.readFile(altPath, 'utf8')
    }
  }

  return `\
  import { fillMetadataSegment } from 'next/dist/lib/metadata/get-metadata-route'

  export default async (props) => {
    const imageData = ${JSON.stringify(imageData)}
    const imageUrl = fillMetadataSegment(${JSON.stringify(
      pathnamePrefix
    )}, await props.params, ${JSON.stringify(pageSegment)})

    return [{
      ...imageData,
      url: imageUrl + ${JSON.stringify(hashQuery)},
    }]
  }`
}

export const raw = true
export default nextMetadataImageLoader
