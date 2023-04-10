import type webpack from 'webpack'
import type {
  CollectingMetadata,
  PossibleImageFileNameConvention,
} from './types'
import path from 'path'
import { stringify } from 'querystring'
import { STATIC_METADATA_IMAGES } from '../../../../lib/metadata/is-metadata-route'
import { normalizeAppPath } from '../../../../shared/lib/router/utils/app-paths'

const METADATA_TYPE = 'metadata'

export const METADATA_RESOURCE_QUERY = '?__next_metadata'

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
    segment,
    resolvePath,
    isRootLayer,
    loaderContext,
    pageExtensions,
  }: {
    segment: string
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
    openGraph: [],
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
      [
        ...STATIC_METADATA_IMAGES[type].extensions,
        ...(type === 'favicon' ? [] : pageExtensions),
      ],
      opts
    )
    resolvedMetadataFiles
      .sort((a, b) => a.localeCompare(b))
      .forEach((filepath) => {
        const imageModuleImportSource = `next-metadata-image-loader?${stringify(
          {
            type,
            segment,
            route: normalizeAppPath(segment),
            pageExtensions,
          }
        )}!${filepath}${METADATA_RESOURCE_QUERY}`

        const imageModule = `(async (props) => (await import(/* webpackMode: "eager" */ ${JSON.stringify(
          imageModuleImportSource
        )})).default(props))`
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
    collectIconModuleIfExists('openGraph'),
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
    openGraph: [${metadata.openGraph.join(',')}],
    twitter: [${metadata.twitter.join(',')}],
  }`
    : ''
}
