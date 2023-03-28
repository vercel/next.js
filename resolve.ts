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

function mergeLoaderTrees(tree1: LoaderTree, tree2: LoaderTree): LoaderTree {
  // Merge segment
  const segment = tree1[0] || tree2[0]

  // Merge parallelRoutes
  const parallelRoutesKeys = new Set([
    ...Object.keys(tree1[1]),
    ...Object.keys(tree2[1]),
  ])
  const parallelRoutes: { [parallelRouterKey: string]: LoaderTree } = {}
  for (const key of parallelRoutesKeys) {
    const route1 = tree1[1][key]
    const route2 = tree2[1][key]

    if (route1 && route2) {
      parallelRoutes[key] = mergeLoaderTrees(route1, route2)
    } else {
      parallelRoutes[key] = route1 || route2
    }
  }

  // Merge components
  const components = { ...tree1[2], ...tree2[2] }

  return [segment, parallelRoutes, components]
}

function omitKeys(obj, keys) {
  const result = {}
  for (const key in obj) {
    if (!keys.includes(key)) {
      result[key] = obj[key]
    }
  }
  return result
}

function omitPageAndDefault(obj) {
  return omitKeys(obj, ['page', 'default'])
}

function matchParallelRoute(name: string) {
  return name.startsWith('@') ? name.slice(1) : null
}
function directoryTreeToLoaderTree(
  [directoryName, subdirectories, components]: DirectoryTree,
  pathPrefix: string,
  addLoaderTree: (fullPath: string, loaderTree: LoaderTree) => void
) {
  const currentLevelIsParallelRoute = matchParallelRoute(directoryName)
  const componentsWithoutPageAndDefault = omitPageAndDefault(components)
  if (components.page) {
    if (currentLevelIsParallelRoute) {
      addLoaderTree(pathPrefix, ['__PAGE__', {}, { page: components.page }])
    } else {
      const item = [
        directoryName,
        {},
        componentsWithoutPageAndDefault,
      ] as LoaderTree
      item[1].children = ['__PAGE__', {}, { page: components.page }]
      addLoaderTree(pathPrefix, item)
    }
  }

  if (components.default) {
    if (currentLevelIsParallelRoute) {
      addLoaderTree(pathPrefix, [
        '__DEFAULT__',
        {},
        { default: components.default },
      ])
    } else {
      const item = [
        directoryName,
        {},
        componentsWithoutPageAndDefault,
      ] as LoaderTree
      item[1].children = ['__DEFAULT__', {}, { default: components.default }]
      addLoaderTree(pathPrefix, item)
    }
  }

  for (const subdirectory of subdirectories) {
    const parallelRouteKey = matchParallelRoute(subdirectory[0])
    directoryTreeToLoaderTree(
      subdirectory,
      pathPrefix +
        (parallelRouteKey
          ? ''
          : (pathPrefix === '/' ? '' : '/') + subdirectory[0]),
      (fullPath: string, loaderTree: LoaderTree) => {
        if (currentLevelIsParallelRoute) {
          addLoaderTree(fullPath, loaderTree)
          return
        }
        const childLoaderTree = [
          directoryName,
          { [parallelRouteKey ?? 'children']: loaderTree },
          componentsWithoutPageAndDefault,
        ] as LoaderTree
        addLoaderTree(fullPath, childLoaderTree)
      }
    )
  }
}

async function collectLoaderTreeByEntrypoint(dir) {
  const result = await resolveAppTree(join(__dirname, dir), [
    'js',
    'jsx',
    'ts',
    'tsx',
  ])
  const entrypoints = new Map<string, LoaderTree>()
  console.time(dir + ' TIMING')
  await directoryTreeToLoaderTree(result, '/', (fullPath, loaderTree) => {
    const existingLoaderTree = entrypoints.get(fullPath)

    if (existingLoaderTree) {
      entrypoints.set(
        fullPath,
        mergeLoaderTrees(existingLoaderTree, loaderTree)
      )
      return
    }
    entrypoints.set(fullPath, loaderTree)
  })
  console.timeEnd(dir + ' TIMING')
  return entrypoints
}
collectLoaderTreeByEntrypoint('test/e2e/app-dir/app/app')
collectLoaderTreeByEntrypoint('test/e2e/app-dir/actions/app')
collectLoaderTreeByEntrypoint('test/e2e/app-dir/navigation/app')
collectLoaderTreeByEntrypoint(
  'test/e2e/app-dir/parallel-routes-and-interception/app'
)
collectLoaderTreeByEntrypoint('../front/apps/vercel-site/app')
