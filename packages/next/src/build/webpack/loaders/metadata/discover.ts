import type webpack from 'webpack'
import type {
  CollectingMetadata,
  PossibleImageFileNameConvention,
} from './types'
import path from 'path'
import { stringify } from 'querystring'

const METADATA_TYPE = 'metadata'

export const METADATA_RESOURCE_QUERY = '?__next_metadata'

export const STATIC_METADATA_IMAGES = {
  icon: {
    filename: 'icon',
    extensions: ['ico', 'jpg', 'jpeg', 'png', 'svg'],
  },
  apple: {
    filename: 'apple-icon',
    extensions: ['jpg', 'jpeg', 'png'],
  },
  favicon: {
    filename: 'favicon',
    extensions: ['ico'],
  },
  opengraph: {
    filename: 'opengraph-image',
    extensions: ['jpg', 'jpeg', 'png', 'gif'],
  },
  twitter: {
    filename: 'twitter-image',
    extensions: ['jpg', 'jpeg', 'png', 'gif'],
  },
} as const

// Produce all compositions with filename (icon, apple-icon, etc.) with extensions (png, jpg, etc.)
async function enumMetadataFiles(
  dir: string,
  filename: string,
  extensions: readonly string[],
  {
    resolvePath,
    loaderContext,
  }: {
    resolvePath: (pathname: string) => Promise<string>
    loaderContext: webpack.LoaderContext<any>
  }
) {
  const collectedFiles: string[] = []
  // Possible filename without extension could: icon, icon0, ..., icon9
  const possibleFileNames = [filename].concat(
    Array(10)
      .fill(0)
      .map((_, index) => filename + index)
  )
  for (const name of possibleFileNames) {
    for (const ext of extensions) {
      const pathname = path.join(dir, `${name}.${ext}`)
      try {
        const resolved = await resolvePath(pathname)
        loaderContext.addDependency(resolved)

        collectedFiles.push(resolved)
      } catch (err: any) {
        if (!err.message.includes("Can't resolve")) {
          throw err
        }
        loaderContext.addMissingDependency(pathname)
      }
    }
  }

  return collectedFiles
}

export async function createStaticMetadataFromRoute(
  resolvedDir: string,
  {
    route,
    resolvePath,
    isRootLayer,
    loaderContext,
    pageExtensions,
  }: {
    route: string
    resolvePath: (pathname: string) => Promise<string>
    isRootLayer: boolean
    loaderContext: webpack.LoaderContext<any>
    pageExtensions: string[]
  }
) {
  let hasStaticMetadataFiles = false
  const staticImagesMetadata: CollectingMetadata = {
    icon: [],
    apple: [],
    twitter: [],
    opengraph: [],
  }

  const opts = {
    resolvePath,
    loaderContext,
  }

  async function collectIconModuleIfExists(
    type: PossibleImageFileNameConvention
  ) {
    const resolvedMetadataFiles = await enumMetadataFiles(
      resolvedDir,
      STATIC_METADATA_IMAGES[type].filename,
      pageExtensions.concat(STATIC_METADATA_IMAGES[type].extensions),
      opts
    )
    resolvedMetadataFiles
      .sort((a, b) => a.localeCompare(b))
      .forEach((filepath) => {
        const [filename, ext] = path.basename(filepath).split('.')
        const isDynamicResource = pageExtensions.includes(ext)

        // imageModule type: () => Promise<ImageMetaInfo>
        const imageModule = isDynamicResource
          ? `(async () => {
            let { alt, size, contentType } = await import(/* webpackMode: "lazy" */ ${JSON.stringify(
              filepath
            )})

            const props = {
              alt,
              type: contentType,
              url: ${JSON.stringify(route + '/' + filename)},
            }
            if (size) {
              ${
                type === 'twitter' || type === 'opengraph'
                  ? 'props.width = size.width; props.height = size.height;'
                  : 'props.sizes = size.width + "x" + size.height;'
              }
            }
            return props
          })`
          : `() => import(/* webpackMode: "eager" */ ${JSON.stringify(
              `next-metadata-image-loader?${stringify({
                route,
                numericSizes:
                  type === 'twitter' || type === 'opengraph' ? '1' : undefined,
                type,
              })}!` +
                filepath +
                METADATA_RESOURCE_QUERY
            )})`

        hasStaticMetadataFiles = true
        if (type === 'favicon') {
          staticImagesMetadata.icon.unshift(imageModule)
        } else {
          staticImagesMetadata[type].push(imageModule)
        }
      })
  }

  await Promise.all([
    collectIconModuleIfExists('icon'),
    collectIconModuleIfExists('apple'),
    collectIconModuleIfExists('opengraph'),
    collectIconModuleIfExists('twitter'),
    isRootLayer && collectIconModuleIfExists('favicon'),
  ])

  return hasStaticMetadataFiles ? staticImagesMetadata : null
}

export function createMetadataExportsCode(
  metadata: Awaited<ReturnType<typeof createStaticMetadataFromRoute>>
) {
  return metadata
    ? `${METADATA_TYPE}: {
    icon: [${metadata.icon.join(',')}],
    apple: [${metadata.apple.join(',')}],
    opengraph: [${metadata.opengraph.join(',')}],
    twitter: [${metadata.twitter.join(',')}],
  }`
    : ''
}
