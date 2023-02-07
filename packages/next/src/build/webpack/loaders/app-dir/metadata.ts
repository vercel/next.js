import path from 'path'
import { stringify } from 'querystring'

const METADATA_TYPE = 'metadata'

export const METADATA_IMAGE_RESOURCE_QUERY = '?__next_metadata'

const staticAssetIconsImage = {
  icon: {
    filename: 'icon',
    extensions: ['ico', 'jpg', 'png', 'svg'],
  },
  apple: {
    filename: 'apple-touch-icon',
    extensions: ['jpg', 'png', 'svg'],
  },
}

// Produce all compositions with filename (icon, apple-touch-icon, etc.) with extensions (png, jpg, etc.)
async function enumMetadataFiles(
  dir: string,
  filename: string,
  extensions: string[],
  {
    resolvePath,
    addDependency,
    addMissingDependency,
  }: {
    resolvePath: (pathname: string) => Promise<string>
    addDependency: (dep: string) => any
    addMissingDependency: (dep: string) => any
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
        addDependency(resolved)

        collectedFiles.push(resolved)
      } catch (err: any) {
        if (!err.message.includes("Can't resolve")) {
          throw err
        }
        addMissingDependency(pathname)
      }
    }
  }

  return collectedFiles
}

export async function discoverStaticMetadataFiles(
  resolvedDir: string,
  {
    isDev,
    resolvePath,
    addDependency,
    addMissingDependency,
  }: {
    isDev: boolean
    addDependency: (dep: string) => any
    addMissingDependency: (dep: string) => any
    resolvePath: (pathname: string) => Promise<string>
  }
) {
  let hasStaticMetadataFiles = false
  const iconsMetadata: {
    icon: string[]
    apple: string[]
  } = {
    icon: [],
    apple: [],
  }

  const opts = {
    resolvePath,
    addDependency,
    addMissingDependency,
  }

  async function collectIconModuleIfExists(type: 'icon' | 'apple') {
    const resolvedMetadataFiles = await enumMetadataFiles(
      resolvedDir,
      staticAssetIconsImage[type].filename,
      staticAssetIconsImage[type].extensions,
      opts
    )
    resolvedMetadataFiles
      .sort((a, b) => a.localeCompare(b))
      .forEach((filepath) => {
        const iconModule = `() => import(/* webpackMode: "eager" */ ${JSON.stringify(
          `next-metadata-image-loader?${stringify({ isDev })}!` +
            filepath +
            METADATA_IMAGE_RESOURCE_QUERY
        )})`

        hasStaticMetadataFiles = true
        iconsMetadata[type].push(iconModule)
      })
  }

  await Promise.all([
    collectIconModuleIfExists('icon'),
    collectIconModuleIfExists('apple'),
  ])

  return hasStaticMetadataFiles ? iconsMetadata : null
}

export function buildMetadata(
  metadata: Awaited<ReturnType<typeof discoverStaticMetadataFiles>>
) {
  return metadata
    ? `${METADATA_TYPE}: {
    icon: [${metadata.icon.join(',')}],
    apple: [${metadata.apple.join(',')}]
  }`
    : ''
}
