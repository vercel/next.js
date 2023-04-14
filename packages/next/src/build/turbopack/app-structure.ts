// This file is a port of app_structure.rs. Ensure it stays in sync.
const fs = require('fs/promises') as typeof import('fs/promises')
const path = require('path') as typeof import('path')

type FileSystemPathVc = string

type Components = {
  page?: FileSystemPathVc | null
  layout?: FileSystemPathVc | null
  error?: FileSystemPathVc | null
  loading?: FileSystemPathVc | null
  template?: FileSystemPathVc | null
  default?: FileSystemPathVc | null
  route?: FileSystemPathVc | null
  metadata?: Metadata
}

type DirectoryTree = {
  subdirectories: Map<string, Promise<DirectoryTree>>
  components: Components
}

interface Metadata {
  icon: FileSystemPathVc[]
  apple: FileSystemPathVc[]
  twitter: FileSystemPathVc[]
  openGraph: FileSystemPathVc[]
  favicon: FileSystemPathVc[]
}

function isEmpty(metadata: Metadata): boolean {
  const { icon, apple, twitter, openGraph, favicon } = metadata
  return (
    icon.length === 0 &&
    apple.length === 0 &&
    twitter.length === 0 &&
    openGraph.length === 0 &&
    favicon.length === 0
  )
}

function mergeMetadata(a: Metadata, b: Metadata): Metadata {
  return {
    icon: [...a.icon, ...b.icon],
    apple: [...a.apple, ...b.apple],
    twitter: [...a.twitter, ...b.twitter],
    openGraph: [...a.openGraph, ...b.openGraph],
    favicon: [...a.favicon, ...b.favicon],
  }
}

function withoutLeafs(components: Components): Components {
  const obj: Components = {
    ...components,
  }
  delete obj.page
  delete obj.default
  delete obj.route
  return obj
}

function withoutNull(components: Components): Components {
  const obj: Components = {
    ...components,
  }
  for (const key of Object.keys(obj)) {
    if (key === 'metadata' && isEmpty(obj[key]!)) {
      delete obj[key]
    }
    if (obj[key] === null) {
      delete obj[key]
    }
  }
  return obj
}

function mergeComponents(a: Components, b: Components): Components {
  return {
    page: a.page ?? b.page,
    layout: a.layout ?? b.layout,
    error: a.error ?? b.error,
    loading: a.loading ?? b.loading,
    template: a.template ?? b.template,
    default: a.default ?? b.default,
    route: a.route ?? b.route,
    metadata:
      a.metadata && b.metadata
        ? mergeMetadata(a.metadata, b.metadata)
        : undefined,
  }
}

const STATIC_METADATA_IMAGES = new Map<string, string[]>([
  ['icon', ['ico', 'jpg', 'jpeg', 'png', 'svg']],
  ['apple-icon', ['jpg', 'jpeg', 'png']],
  ['favicon', ['ico']],
  ['opengraph-image', ['jpg', 'jpeg', 'png', 'gif']],
  ['twitter-image', ['jpg', 'jpeg', 'png', 'gif']],
])

function matchMetadataFile(basename: string): string | null {
  const [stem, ext] = basename.split('.')
  const regex = /\d*$/
  const newStem = stem.replace(regex, '')

  const key = STATIC_METADATA_IMAGES.get(newStem)
  if (key && key.includes(ext)) {
    return newStem
  }
  return null
}

async function getDirectoryTree(
  appDir: string,
  pageExtensions: string[]
): Promise<DirectoryTree> {
  const entries = await fs.readdir(appDir, { withFileTypes: true })

  if (!entries) {
    throw new Error('appDir must be a directory')
  }

  const subdirectories = new Map<string, Promise<DirectoryTree>>()
  const components: Components = {
    page: null,
    layout: null,
    error: null,
    loading: null,
    template: null,
    default: null,
    route: null,
    metadata: {
      icon: [],
      apple: [],
      twitter: [],
      openGraph: [],
      favicon: [],
    },
  }

  for (const entry of entries) {
    const basename = entry.name
    if (entry.isFile()) {
      const [stem, ext] = basename.split('.')
      if (pageExtensions.includes(ext)) {
        switch (stem) {
          case 'page':
            components.page = path.join(appDir, basename)
            break
          case 'layout':
            components.layout = path.join(appDir, basename)
            break
          case 'error':
            components.error = path.join(appDir, basename)
            break
          case 'loading':
            components.loading = path.join(appDir, basename)
            break
          case 'template':
            components.template = path.join(appDir, basename)
            break
          case 'default':
            components.default = path.join(appDir, basename)
            break
          case 'route':
            components.route = path.join(appDir, basename)
            break
          default:
            break
        }
      }
      const metadataType = matchMetadataFile(basename)
      if (metadataType && components.metadata) {
        components.metadata[metadataType].push(
          await fs.open(path.join(appDir, basename), 'r')
        )
      }
    } else if (entry.isDirectory()) {
      const subdirPath = path.join(appDir, basename)
      const result = getDirectoryTree(subdirPath, pageExtensions)
      subdirectories.set(basename, result)
    }
    // TODO handle symlinks in app dir
  }

  return {
    subdirectories,
    components,
  }
}

type LoaderTree = {
  segment: string
  parallelRoutes: Map<string, Promise<LoaderTree>>
  components: Promise<Components>
}

type Entrypoint =
  | {
      type: 'AppPage'
      loaderTree: Promise<LoaderTree>
    }
  | {
      type: 'AppRoute'
      path: string
    }

type Entrypoints = Map<string, Entrypoint>

async function mergeLoaderTrees(
  appDir: string,
  tree1: Promise<LoaderTree>,
  tree2: Promise<LoaderTree>
): Promise<LoaderTree> {
  const t1 = await tree1
  const t2 = await tree2

  const segment = t1.segment || t2.segment
  const parallelRoutes = new Map(t1.parallelRoutes)

  for (const [key, tree2Route] of t2.parallelRoutes.entries()) {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    await addParallelRoute(appDir, parallelRoutes, key, tree2Route)
  }

  const components = Promise.resolve(
    mergeComponents(await t1.components, await t2.components)
  )

  return { segment, parallelRoutes, components }
}

function isParallelRoute(name: string): boolean {
  return name.startsWith('@')
}

function matchParallelRoute(name: string): string | null {
  return name.startsWith('@') ? name.substring(1) : null
}

function isOptionalSegment(name: string): boolean {
  return name.startsWith('(') && name.endsWith(')')
}

async function addParallelRoute(
  appDir: string,
  result: Map<string, Promise<LoaderTree>>,
  key: string,
  loaderTree: Promise<LoaderTree>
): Promise<void> {
  const value = result.get(key)
  if (value) {
    result.set(key, mergeLoaderTrees(appDir, value, loaderTree))
  } else {
    result.set(key, loaderTree)
  }
}

async function addAppPage(
  appDir: string,
  result: Entrypoints,
  key: string,
  loaderTree: Promise<LoaderTree>
): Promise<void> {
  const entrypoint = result.get(key)
  if (entrypoint) {
    if (entrypoint.type !== 'AppPage') {
      // Emit an error about conflicting routes
      console.error(`Conflicting route at ${key}`)
      return
    }

    const mergedTree = await mergeLoaderTrees(
      appDir,
      entrypoint.loaderTree,
      loaderTree
    )
    result.set(key, {
      type: 'AppPage',
      loaderTree: Promise.resolve(mergedTree),
    })
  } else {
    result.set(key, { type: 'AppPage', loaderTree })
  }
}

async function addAppRoute(
  appDir: string,
  result: Entrypoints,
  key: string,
  filePath: string
): Promise<void> {
  if (result.has(key)) {
    // Emit an error about conflicting routes
    console.error(`Conflicting route at ${key}`)
  }
  result.set(key, { type: 'AppRoute', path: filePath })
}

async function directoryTreeToEntrypointsInternal(
  appDir: string,
  directoryName: string,
  directoryTreePromise: ReturnType<typeof getDirectoryTree>,
  pathPrefix: string
): Promise<Entrypoints> {
  const result = new Map<string, Entrypoint>()

  const directoryTree = await directoryTreePromise
  const subdirectories = directoryTree.subdirectories
  const components = directoryTree.components

  console.log({ components })

  const currentLevelIsParallelRoute = isParallelRoute(directoryName)

  if (components.page) {
    await addAppPage(
      appDir,
      result,
      pathPrefix,
      currentLevelIsParallelRoute
        ? ({
            segment: '__PAGE__',
            parallelRoutes: new Map(),
            components: { page: components.page },
          } as any)
        : {
            segment: directoryName,
            parallelRoutes: new Map([
              [
                'children',
                {
                  segment: '__PAGE__',
                  parallelRoutes: new Map(),
                  components: { page: components.page },
                },
              ],
            ]),
            components: withoutNull(withoutLeafs(components)),
          }
    )
  }

  if (components.default) {
    await addAppPage(
      appDir,
      result,
      pathPrefix,
      currentLevelIsParallelRoute
        ? ({
            segment: '__DEFAULT__',
            parallelRoutes: new Map(),
            components: { default: components.default },
          } as any)
        : {
            segment: directoryName,
            parallelRoutes: new Map([
              [
                'children',
                {
                  segment: '__DEFAULT__',
                  parallelRoutes: new Map(),
                  components: { default: components.default },
                },
              ],
            ]),
            components: withoutNull(withoutLeafs(components)),
          }
    )
  }

  if (components.route) {
    await addAppRoute(appDir, result, pathPrefix, components.route)
  }

  for (const [subdirName, subdirectory] of subdirectories.entries()) {
    console.log({ subdirName, subdirectory })
    const parallelRouteKey = matchParallelRoute(subdirName)
    const optionalSegment = isOptionalSegment(subdirName)
    const newPathPrefix =
      parallelRouteKey || optionalSegment
        ? pathPrefix
        : path.join(pathPrefix, subdirName)

    const map = await directoryTreeToEntrypointsInternal(
      appDir,
      subdirName,
      subdirectory,
      newPathPrefix
    )

    for (const [fullPath, entrypoint] of map.entries()) {
      if (entrypoint.type === 'AppPage') {
        if (currentLevelIsParallelRoute) {
          await addAppPage(appDir, result, fullPath, entrypoint.loaderTree)
        } else {
          const childLoaderTree: LoaderTree = {
            segment: directoryName,
            parallelRoutes: new Map([
              [parallelRouteKey || 'children', entrypoint.loaderTree],
            ]),
            components: Promise.resolve(withoutNull(withoutLeafs(components))),
          }

          await addAppPage(
            appDir,
            result,
            fullPath,
            Promise.resolve(childLoaderTree)
          )
        }
      } else if (entrypoint.type === 'AppRoute') {
        await addAppRoute(appDir, result, fullPath, entrypoint.path)
      }
    }
  }

  return result
}

async function directoryTreeToEntrypoints(
  appDir: string,
  directoryTree: ReturnType<typeof getDirectoryTree>
): Promise<Entrypoints> {
  return directoryTreeToEntrypointsInternal(appDir, '', directoryTree, '/')
}

export async function getEntrypoints(
  appDir: string,
  pageExtensions: string[]
): Promise<Entrypoints> {
  return directoryTreeToEntrypoints(
    appDir,
    getDirectoryTree(appDir, pageExtensions)
  )
}
