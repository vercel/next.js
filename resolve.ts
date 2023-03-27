const { join, parse } = require('path') as typeof import('path')
const { readdir } = require('fs/promises') as typeof import('fs/promises')
type DirectoryTree = [
  directoryName: string,
  subdirectories: DirectoryTree[],
  components: {
    page?: string
    layout?: string
    error?: string
    loading?: string
    template?: string
    default?: string
    metadata?: {
      icon?: string[]
      apple?: string[]
      twitter?: string[]
      openGraph?: string[]
    }
  }
]
type ParsedPath = ReturnType<typeof parse>
const FILE_TYPES = ['page', 'layout', 'error', 'loading', 'template', 'default']
function matchFileTypes(
  file: ParsedPath,
  pageExtensions: string[]
): string | null {
  const { name, ext } = file
  const fileType =
    FILE_TYPES.includes(name) && pageExtensions.includes(ext.slice(1))
  if (fileType) {
    return name
  }
  return null
}
const STATIC_METADATA_IMAGES = {
  icon: {
    key: 'icon',
    extensions: ['ico', 'jpg', 'jpeg', 'png', 'svg'],
  },
  'apple-icon': {
    key: 'apple',
    extensions: ['jpg', 'jpeg', 'png'],
  },
  favicon: {
    key: 'favicon',
    extensions: ['ico'],
  },
  'opengraph-image': {
    key: 'openGraph',
    extensions: ['jpg', 'jpeg', 'png', 'gif'],
  },
  'twitter-image': {
    key: 'twitter',
    extensions: ['jpg', 'jpeg', 'png', 'gif'],
  },
}
for (let i = 0; i < 9; i++) {
  STATIC_METADATA_IMAGES[`icon${i}`] = STATIC_METADATA_IMAGES.icon
  STATIC_METADATA_IMAGES[`apple-icon${i}`] =
    STATIC_METADATA_IMAGES['apple-icon']
  STATIC_METADATA_IMAGES[`favicon${1}`] = STATIC_METADATA_IMAGES['favicon']
  STATIC_METADATA_IMAGES[`opengraph-image${i}`] =
    STATIC_METADATA_IMAGES['opengraph-image']
  STATIC_METADATA_IMAGES[`twitter-image${i}`] =
    STATIC_METADATA_IMAGES['twitter-image']
}
function matchMetaDataFile(file: ParsedPath): string | null {
  const { name, ext } = file
  const metaDataItem = STATIC_METADATA_IMAGES[name]
  if (!metaDataItem) {
    return null
  }
  const { key, extensions } = metaDataItem
  if (extensions.includes(ext.slice(1))) {
    return key
  }
  return null
}

async function resolveAppTree(
  dir,
  pageExtensions,
  directoryName: string = ''
): Promise<DirectoryTree> {
  const dirItems = await readdir(dir, { withFileTypes: true })
  const children: DirectoryTree[] = []
  const components: DirectoryTree[2] = {}
  for (const dirItem of dirItems) {
    const name = dirItem.name
    const isDirectory = dirItem.isDirectory()
    const isFile = dirItem.isFile()
    if (isFile) {
      const item = parse(name)
      const fileType = matchFileTypes(item, pageExtensions)
      if (fileType) {
        components[fileType] = join(dir, name)
        continue
      }
      const metadataType = matchMetaDataFile(item)
      if (metadataType) {
        if (!components.metadata) {
          components.metadata = {}
        }
        if (!components.metadata[metadataType]) {
          components.metadata[metadataType] = []
        }
        components.metadata[metadataType].push(join(dir, name))
        continue
      }
      continue
    }
    if (isDirectory) {
      const subDir = join(dir, name)
      const result = await resolveAppTree(subDir, pageExtensions, name)
      children.push(result)
    }
  }
  return [directoryName, children, components]
}

/**
 * LoaderTree is generated in next-app-loader.
 */
type LoaderTree = [
  segment: string,
  parallelRoutes: { [parallelRouterKey: string]: LoaderTree },
  components: {
    page?: string
    layout?: string
    error?: string
    loading?: string
    template?: string
    default?: string
    metadata?: {
      icon?: string[]
      apple?: string[]
      twitter?: string[]
      openGraph?: string[]
    }
  }
]
function matchParallelRoute(name: string) {
  return name.startsWith('@') ? name.slice(1) : null
}
function directoryTreeToLoaderTree(
  [directoryName, subdirectories, components]: DirectoryTree,
  pathPrefix: string,
  entrypoints: Map<string, LoaderTree>,
  createLoaderTree: (route: string, patch: LoaderTree) => void
): LoaderTree {
  const item = [directoryName, {}, components] as LoaderTree

  for (const subdirectory of subdirectories) {
    const parallelRouteKey = matchParallelRoute(subdirectory[0])
    if (!parallelRouteKey) {
      const parallelRouteLoaderTree = directoryTreeToLoaderTree(
        subdirectory,
        join(pathPrefix, subdirectory[0]),
        entrypoints,
        (route, patch) => {
          entrypoints.set(route, patch)
        }
      )
      item[1][subdirectory[0]] = parallelRouteLoaderTree

      continue
    }
  }

  createLoaderTree(pathPrefix, item)
  return item
}
async function run() {
  const result = await resolveAppTree(
    join(__dirname, 'test/e2e/app-dir/parallel-routes-and-interception/app'),
    ['js', 'jsx', 'ts', 'tsx']
  )
  const entrypoints = new Map()
  await directoryTreeToLoaderTree(result, '/', entrypoints, () => {})
  console.dir(entrypoints, { depth: null })
}
run()
