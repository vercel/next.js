import type webpack from 'next/dist/compiled/webpack/webpack'
import type { ValueOf } from '../../../shared/lib/constants'
import type { ModuleReference, CollectedMetadata } from './metadata/types'

import path from 'path'
import { stringify } from 'querystring'
import { bold } from '../../../lib/picocolors'
import { getModuleBuildInfo } from './get-module-build-info'
import { verifyRootLayout } from '../../../lib/verify-root-layout'
import * as Log from '../../output/log'
import { APP_DIR_ALIAS, WEBPACK_RESOURCE_QUERIES } from '../../../lib/constants'
import {
  createMetadataExportsCode,
  createStaticMetadataFromRoute,
} from './metadata/discover'
import { promises as fs } from 'fs'
import { isAppRouteRoute } from '../../../lib/is-app-route-route'
import { isMetadataRoute } from '../../../lib/metadata/is-metadata-route'
import type { NextConfig } from '../../../server/config-shared'
import { AppPathnameNormalizer } from '../../../server/future/normalizers/built/app/app-pathname-normalizer'
import { AppBundlePathNormalizer } from '../../../server/future/normalizers/built/app/app-bundle-path-normalizer'
import type { MiddlewareConfig } from '../../analysis/get-page-static-info'
import { getFilenameAndExtension } from './next-metadata-route-loader'
import { isAppBuiltinNotFoundPage } from '../../utils'
import { loadEntrypoint } from '../../load-entrypoint'
import {
  isGroupSegment,
  DEFAULT_SEGMENT_KEY,
  PAGE_SEGMENT_KEY,
} from '../../../shared/lib/segment'
import { getFilesInDir } from '../../../lib/get-files-in-dir'
import { normalizeAppPath } from '../../../shared/lib/router/utils/app-paths'
import type { PageExtensions } from '../../page-extensions-type'
import { PARALLEL_ROUTE_DEFAULT_PATH } from '../../../client/components/parallel-route-default'

export type AppLoaderOptions = {
  name: string
  page: string
  pagePath: string
  appDir: string
  appPaths: readonly string[] | null
  preferredRegion: string | string[] | undefined
  pageExtensions: PageExtensions
  assetPrefix: string
  rootDir?: string
  tsconfigPath?: string
  isDev?: boolean
  basePath: string
  nextConfigOutput?: NextConfig['output']
  middlewareConfig: string
}
type AppLoader = webpack.LoaderDefinitionFunction<AppLoaderOptions>

const FILE_TYPES = {
  layout: 'layout',
  template: 'template',
  error: 'error',
  loading: 'loading',
  'not-found': 'not-found',
} as const

const GLOBAL_ERROR_FILE_TYPE = 'global-error'
const PAGE_SEGMENT = 'page$'
const PARALLEL_CHILDREN_SEGMENT = 'children$'

const defaultNotFoundPath = 'next/dist/client/components/not-found-error'
const defaultGlobalErrorPath = 'next/dist/client/components/error-boundary'
const defaultLayoutPath = 'next/dist/client/components/default-layout'

type DirResolver = (pathToResolve: string) => string
type PathResolver = (
  pathname: string
) => Promise<string | undefined> | string | undefined
export type MetadataResolver = (
  dir: string,
  filename: string,
  extensions: readonly string[]
) => Promise<string | undefined>

export type ComponentsType = {
  readonly [componentKey in ValueOf<typeof FILE_TYPES>]?: ModuleReference
} & {
  readonly page?: ModuleReference
} & {
  readonly metadata?: CollectedMetadata
} & {
  readonly defaultPage?: ModuleReference
}

async function createAppRouteCode({
  name,
  page,
  pagePath,
  resolveAppRoute,
  pageExtensions,
  nextConfigOutput,
}: {
  name: string
  page: string
  pagePath: string
  resolveAppRoute: PathResolver
  pageExtensions: PageExtensions
  nextConfigOutput: NextConfig['output']
}): Promise<string> {
  // routePath is the path to the route handler file,
  // but could be aliased e.g. private-next-app-dir/favicon.ico
  const routePath = pagePath.replace(/[\\/]/, '/')

  // This, when used with the resolver will give us the pathname to the built
  // route handler file.
  let resolvedPagePath = await resolveAppRoute(routePath)
  if (!resolvedPagePath) {
    throw new Error(
      `Invariant: could not resolve page path for ${name} at ${routePath}`
    )
  }

  // If this is a metadata route, then we need to use the metadata loader for
  // the route to ensure that the route is generated.
  const filename = path.parse(resolvedPagePath).name
  if (isMetadataRoute(name) && filename !== 'route') {
    const { ext } = getFilenameAndExtension(resolvedPagePath)
    const isDynamic = pageExtensions.includes(ext)

    resolvedPagePath = `next-metadata-route-loader?${stringify({
      page,
      isDynamic: isDynamic ? '1' : '0',
    })}!${resolvedPagePath}${`?${WEBPACK_RESOURCE_QUERIES.metadataRoute}`}`
  }

  const pathname = new AppPathnameNormalizer().normalize(page)
  const bundlePath = new AppBundlePathNormalizer().normalize(page)

  return await loadEntrypoint(
    'app-route',
    {
      VAR_USERLAND: resolvedPagePath,
      VAR_DEFINITION_PAGE: page,
      VAR_DEFINITION_PATHNAME: pathname,
      VAR_DEFINITION_FILENAME: filename,
      VAR_DEFINITION_BUNDLE_PATH: bundlePath,
      VAR_RESOLVED_PAGE_PATH: resolvedPagePath,
      VAR_ORIGINAL_PATHNAME: page,
    },
    {
      nextConfigOutput: JSON.stringify(nextConfigOutput),
    }
  )
}

const normalizeParallelKey = (key: string) =>
  key.startsWith('@') ? key.slice(1) : key

const isDirectory = async (pathname: string) => {
  try {
    const stat = await fs.stat(pathname)
    return stat.isDirectory()
  } catch (err) {
    return false
  }
}

async function createTreeCodeFromPath(
  pagePath: string,
  {
    page,
    resolveDir,
    resolver,
    resolveParallelSegments,
    metadataResolver,
    pageExtensions,
    basePath,
  }: {
    page: string
    resolveDir: DirResolver
    resolver: PathResolver
    metadataResolver: MetadataResolver
    resolveParallelSegments: (
      pathname: string
    ) => [key: string, segment: string | string[]][]
    loaderContext: webpack.LoaderContext<AppLoaderOptions>
    pageExtensions: PageExtensions
    basePath: string
  }
): Promise<{
  treeCode: string
  pages: string
  rootLayout: string | undefined
  globalError: string
}> {
  const splittedPath = pagePath.split(/[\\/]/, 1)
  const isNotFoundRoute = page === '/_not-found'
  const isDefaultNotFound = isAppBuiltinNotFoundPage(pagePath)
  const appDirPrefix = isDefaultNotFound ? APP_DIR_ALIAS : splittedPath[0]
  const hasRootNotFound = await resolver(
    `${appDirPrefix}/${FILE_TYPES['not-found']}`
  )
  const pages: string[] = []

  let rootLayout: string | undefined
  let globalError: string | undefined

  async function resolveAdjacentParallelSegments(
    segmentPath: string
  ): Promise<string[]> {
    const absoluteSegmentPath = await resolveDir(
      `${appDirPrefix}${segmentPath}`
    )

    if (!absoluteSegmentPath) {
      return []
    }

    const segmentIsDirectory = await isDirectory(absoluteSegmentPath)

    if (!segmentIsDirectory) {
      return []
    }

    // We need to resolve all parallel routes in this level.
    const files = await fs.opendir(absoluteSegmentPath)

    const parallelSegments: string[] = ['children']

    for await (const dirent of files) {
      // Make sure name starts with "@" and is a directory.
      if (dirent.isDirectory() && dirent.name.charCodeAt(0) === 64) {
        parallelSegments.push(dirent.name)
      }
    }

    return parallelSegments
  }

  async function createSubtreePropsFromSegmentPath(
    segments: string[]
  ): Promise<{
    treeCode: string
  }> {
    const segmentPath = segments.join('/')

    // Existing tree are the children of the current segment
    const props: Record<string, string> = {}
    // Root layer could be 1st layer of normal routes
    const isRootLayer = segments.length === 0
    const isRootLayoutOrRootPage = segments.length <= 1

    // We need to resolve all parallel routes in this level.
    const parallelSegments: [key: string, segment: string | string[]][] = []
    if (isRootLayer) {
      parallelSegments.push(['children', ''])
    } else {
      parallelSegments.push(...resolveParallelSegments(segmentPath))
    }

    let metadata: Awaited<ReturnType<typeof createStaticMetadataFromRoute>> =
      null
    const routerDirPath = `${appDirPrefix}${segmentPath}`
    // For default not-found, don't traverse the directory to find metadata.
    const resolvedRouteDir = isDefaultNotFound
      ? ''
      : await resolveDir(routerDirPath)

    if (resolvedRouteDir) {
      metadata = await createStaticMetadataFromRoute(resolvedRouteDir, {
        basePath,
        segment: segmentPath,
        metadataResolver,
        isRootLayoutOrRootPage,
        pageExtensions,
      })
    }

    for (const [parallelKey, parallelSegment] of parallelSegments) {
      if (parallelSegment === PAGE_SEGMENT) {
        const matchedPagePath = `${appDirPrefix}${segmentPath}${
          parallelKey === 'children' ? '' : `/${parallelKey}`
        }/page`

        const resolvedPagePath = await resolver(matchedPagePath)
        if (resolvedPagePath) pages.push(resolvedPagePath)

        // Use '' for segment as it's the page. There can't be a segment called '' so this is the safest way to add it.
        props[
          normalizeParallelKey(parallelKey)
        ] = `['${PAGE_SEGMENT_KEY}', {}, {
          page: [() => import(/* webpackMode: "eager" */ ${JSON.stringify(
            resolvedPagePath
          )}), ${JSON.stringify(resolvedPagePath)}],
          ${createMetadataExportsCode(metadata)}
        }]`

        continue
      }

      const subSegmentPath = [...segments]
      if (parallelKey !== 'children') {
        subSegmentPath.push(parallelKey)
      }

      const normalizedParallelSegments = Array.isArray(parallelSegment)
        ? parallelSegment.slice(0, 1)
        : [parallelSegment]

      subSegmentPath.push(
        ...normalizedParallelSegments.filter(
          (segment) =>
            segment !== PAGE_SEGMENT && segment !== PARALLEL_CHILDREN_SEGMENT
        )
      )

      const { treeCode: pageSubtreeCode } =
        await createSubtreePropsFromSegmentPath(subSegmentPath)

      const parallelSegmentPath = subSegmentPath.join('/')

      // `page` is not included here as it's added above.
      const filePaths = await Promise.all(
        Object.values(FILE_TYPES).map(async (file) => {
          return [
            file,
            await resolver(
              `${appDirPrefix}${
                // TODO-APP: parallelSegmentPath sometimes ends in `/` but sometimes it doesn't. This should be consistent.
                parallelSegmentPath.endsWith('/')
                  ? parallelSegmentPath
                  : parallelSegmentPath + '/'
              }${file}`
            ),
          ] as const
        })
      )

      const definedFilePaths = filePaths.filter(
        ([, filePath]) => filePath !== undefined
      )

      // Add default not found error as root not found if not present
      const hasNotFoundFile = definedFilePaths.some(
        ([type]) => type === 'not-found'
      )
      // If the first layer is a group route, we treat it as root layer
      const isFirstLayerGroupRoute =
        segments.length === 1 &&
        subSegmentPath.filter((seg) => isGroupSegment(seg)).length === 1
      if ((isRootLayer || isFirstLayerGroupRoute) && !hasNotFoundFile) {
        // If you already have a root not found, don't insert default not-found to group routes root
        if (!(hasRootNotFound && isFirstLayerGroupRoute)) {
          definedFilePaths.push(['not-found', defaultNotFoundPath])
        }
      }

      if (!rootLayout) {
        const layoutPath = definedFilePaths.find(
          ([type]) => type === 'layout'
        )?.[1]
        rootLayout = layoutPath

        if (isDefaultNotFound && !layoutPath && !rootLayout) {
          rootLayout = defaultLayoutPath
          definedFilePaths.push(['layout', rootLayout])
        }
      }

      if (!globalError) {
        const resolvedGlobalErrorPath = await resolver(
          `${appDirPrefix}/${GLOBAL_ERROR_FILE_TYPE}`
        )
        if (resolvedGlobalErrorPath) {
          globalError = resolvedGlobalErrorPath
        }
      }

      let parallelSegmentKey = Array.isArray(parallelSegment)
        ? parallelSegment[0]
        : parallelSegment

      parallelSegmentKey =
        parallelSegmentKey === PARALLEL_CHILDREN_SEGMENT
          ? 'children'
          : parallelSegmentKey

      const normalizedParallelKey = normalizeParallelKey(parallelKey)
      let subtreeCode = pageSubtreeCode
      // If it's root not found page, set not-found boundary as children page
      if (isNotFoundRoute && normalizedParallelKey === 'children') {
        const notFoundPath =
          definedFilePaths.find(([type]) => type === 'not-found')?.[1] ??
          defaultNotFoundPath
        subtreeCode = `{
          children: ['${PAGE_SEGMENT_KEY}', {}, {
            page: [
              () => import(/* webpackMode: "eager" */ ${JSON.stringify(
                notFoundPath
              )}),
              ${JSON.stringify(notFoundPath)}
            ]
          }]
        }`
      }

      const componentsCode = `{
        ${definedFilePaths
          .map(([file, filePath]) => {
            return `'${file}': [() => import(/* webpackMode: "eager" */ ${JSON.stringify(
              filePath
            )}), ${JSON.stringify(filePath)}],`
          })
          .join('\n')}
        ${createMetadataExportsCode(metadata)}
      }`

      props[normalizedParallelKey] = `[
        '${parallelSegmentKey}',
        ${subtreeCode},
        ${componentsCode}
      ]`
    }

    const adjacentParallelSegments = await resolveAdjacentParallelSegments(
      segmentPath
    )

    for (const adjacentParallelSegment of adjacentParallelSegments) {
      if (!props[normalizeParallelKey(adjacentParallelSegment)]) {
        const actualSegment =
          adjacentParallelSegment === 'children' ? '' : adjacentParallelSegment
        let defaultPath = await resolver(
          `${appDirPrefix}${segmentPath}/${actualSegment}/default`
        )

        if (!defaultPath) {
          // no default was found at this segment. Check if the normalized segment resolves a default
          // for example: /(level1)/(level2)/default doesn't exist, but /default does
          const normalizedDefault = await resolver(
            `${appDirPrefix}${normalizeAppPath(
              segmentPath
            )}/${actualSegment}/default`
          )

          // if a default is found, use that. Otherwise use the fallback, which will trigger a `notFound()`
          defaultPath = normalizedDefault ?? PARALLEL_ROUTE_DEFAULT_PATH
        }

        props[normalizeParallelKey(adjacentParallelSegment)] = `[
          '${DEFAULT_SEGMENT_KEY}',
          {},
          {
            defaultPage: [() => import(/* webpackMode: "eager" */ ${JSON.stringify(
              defaultPath
            )}), ${JSON.stringify(defaultPath)}],
          }
        ]`
      }
    }
    return {
      treeCode: `{
        ${Object.entries(props)
          .map(([key, value]) => `${key}: ${value}`)
          .join(',\n')}
      }`,
    }
  }

  const { treeCode } = await createSubtreePropsFromSegmentPath([])

  return {
    treeCode: `${treeCode}.children;`,
    pages: `${JSON.stringify(pages)};`,
    rootLayout,
    globalError: globalError ?? defaultGlobalErrorPath,
  }
}

function createAbsolutePath(appDir: string, pathToTurnAbsolute: string) {
  return (
    pathToTurnAbsolute
      // Replace all POSIX path separators with the current OS path separator
      .replace(/\//g, path.sep)
      .replace(/^private-next-app-dir/, appDir)
  )
}

const nextAppLoader: AppLoader = async function nextAppLoader() {
  const loaderOptions = this.getOptions()
  const {
    name,
    appDir,
    appPaths,
    pagePath,
    pageExtensions,
    rootDir,
    tsconfigPath,
    isDev,
    nextConfigOutput,
    preferredRegion,
    basePath,
    middlewareConfig: middlewareConfigBase64,
  } = loaderOptions

  const buildInfo = getModuleBuildInfo((this as any)._module)
  const page = name.replace(/^app/, '')
  const middlewareConfig: MiddlewareConfig = JSON.parse(
    Buffer.from(middlewareConfigBase64, 'base64').toString()
  )
  buildInfo.route = {
    page,
    absolutePagePath: createAbsolutePath(appDir, pagePath),
    preferredRegion,
    middlewareConfig,
  }

  const extensions = pageExtensions.map((extension) => `.${extension}`)

  const normalizedAppPaths =
    typeof appPaths === 'string' ? [appPaths] : appPaths || []

  const resolveParallelSegments = (
    pathname: string
  ): [string, string | string[]][] => {
    const matched: Record<string, string | string[]> = {}
    let existingChildrenPath: string | undefined
    for (const appPath of normalizedAppPaths) {
      if (appPath.startsWith(pathname + '/')) {
        const rest = appPath.slice(pathname.length + 1).split('/')

        // It is the actual page, mark it specially.
        if (rest.length === 1 && rest[0] === 'page') {
          existingChildrenPath = appPath
          matched.children = PAGE_SEGMENT
          continue
        }

        const isParallelRoute = rest[0].startsWith('@')
        if (isParallelRoute) {
          if (rest.length === 2 && rest[1] === 'page') {
            // matched will be an empty object in case the parallel route is at a path with no existing page
            // in which case, we need to mark it as a regular page segment
            matched[rest[0]] = Object.keys(matched).length
              ? [PAGE_SEGMENT]
              : PAGE_SEGMENT
            continue
          }
          // we insert a special marker in order to also process layout/etc files at the slot level
          matched[rest[0]] = [PARALLEL_CHILDREN_SEGMENT, ...rest.slice(1)]
          continue
        }

        if (existingChildrenPath && matched.children !== rest[0]) {
          // If we get here, it means we already set a `page` segment earlier in the loop,
          // meaning we already matched a page to the `children` parallel segment.
          const isIncomingParallelPage = appPath.includes('@')
          const hasCurrentParallelPage = existingChildrenPath.includes('@')

          if (isIncomingParallelPage) {
            // The duplicate segment was for a parallel slot. In this case,
            // rather than throwing an error, we can ignore it since this can happen for valid reasons.
            // For example, when we attempt to normalize catch-all routes, we'll push potential slot matches so
            // that they are available in the loader tree when we go to render the page.
            // We only need to throw an error if the duplicate segment was for a regular page.
            // For example, /app/(groupa)/page & /app/(groupb)/page is an error since it corresponds
            // with the same path.
            continue
          } else if (!hasCurrentParallelPage && !isIncomingParallelPage) {
            // Both the current `children` and the incoming `children` are regular pages.
            throw new Error(
              `You cannot have two parallel pages that resolve to the same path. Please check ${existingChildrenPath} and ${appPath}. Refer to the route group docs for more information: https://nextjs.org/docs/app/building-your-application/routing/route-groups`
            )
          }
        }

        existingChildrenPath = appPath
        matched.children = rest[0]
      }
    }
    return Object.entries(matched)
  }

  const resolveDir: DirResolver = (pathToResolve) => {
    return createAbsolutePath(appDir, pathToResolve)
  }

  const resolveAppRoute: PathResolver = (pathToResolve) => {
    return createAbsolutePath(appDir, pathToResolve)
  }

  // Cached checker to see if a file exists in a given directory.
  // This can be more efficient than checking them with `fs.stat` one by one
  // because all the thousands of files are likely in a few possible directories.
  // Note that it should only be cached for this compilation, not globally.
  const filesInDir = new Map<string, Set<string>>()
  const fileExistsInDirectory = async (dirname: string, fileName: string) => {
    const existingFiles = filesInDir.get(dirname)
    if (existingFiles) {
      return existingFiles.has(fileName)
    }
    try {
      const files = await getFilesInDir(dirname)
      const fileNames = new Set<string>(files)
      filesInDir.set(dirname, fileNames)
      return fileNames.has(fileName)
    } catch (err) {
      return false
    }
  }

  const resolver: PathResolver = async (pathname) => {
    const absolutePath = createAbsolutePath(appDir, pathname)

    const filenameIndex = absolutePath.lastIndexOf(path.sep)
    const dirname = absolutePath.slice(0, filenameIndex)
    const filename = absolutePath.slice(filenameIndex + 1)

    let result: string | undefined

    for (const ext of extensions) {
      const absolutePathWithExtension = `${absolutePath}${ext}`
      if (
        !result &&
        (await fileExistsInDirectory(dirname, `${filename}${ext}`))
      ) {
        result = absolutePathWithExtension
      }
      // Call `addMissingDependency` for all files even if they didn't match,
      // because they might be added or removed during development.
      this.addMissingDependency(absolutePathWithExtension)
    }

    return result
  }

  const metadataResolver: MetadataResolver = async (
    dirname,
    filename,
    exts
  ) => {
    const absoluteDir = createAbsolutePath(appDir, dirname)

    let result: string | undefined

    for (const ext of exts) {
      // Compared to `resolver` above the exts do not have the `.` included already, so it's added here.
      const filenameWithExt = `${filename}.${ext}`
      const absolutePathWithExtension = `${absoluteDir}${path.sep}${filenameWithExt}`
      if (!result && (await fileExistsInDirectory(dirname, filenameWithExt))) {
        result = absolutePathWithExtension
      }
      // Call `addMissingDependency` for all files even if they didn't match,
      // because they might be added or removed during development.
      this.addMissingDependency(absolutePathWithExtension)
    }

    return result
  }

  if (isAppRouteRoute(name)) {
    return createAppRouteCode({
      // TODO: investigate if the local `page` is the same as the loaderOptions.page
      page: loaderOptions.page,
      name,
      pagePath,
      resolveAppRoute,
      pageExtensions,
      nextConfigOutput,
    })
  }

  let treeCodeResult = await createTreeCodeFromPath(pagePath, {
    page,
    resolveDir,
    resolver,
    metadataResolver,
    resolveParallelSegments,
    loaderContext: this,
    pageExtensions,
    basePath,
  })

  if (!treeCodeResult.rootLayout) {
    if (!isDev) {
      // If we're building and missing a root layout, exit the build
      Log.error(
        `${bold(
          pagePath.replace(`${APP_DIR_ALIAS}/`, '')
        )} doesn't have a root layout. To fix this error, make sure every page has a root layout.`
      )
      process.exit(1)
    } else {
      // In dev we'll try to create a root layout
      const [createdRootLayout, rootLayoutPath] = await verifyRootLayout({
        appDir: appDir,
        dir: rootDir!,
        tsconfigPath: tsconfigPath!,
        pagePath,
        pageExtensions,
      })
      if (!createdRootLayout) {
        let message = `${bold(
          pagePath.replace(`${APP_DIR_ALIAS}/`, '')
        )} doesn't have a root layout. `

        if (rootLayoutPath) {
          message += `We tried to create ${bold(
            path.relative(this._compiler?.context ?? '', rootLayoutPath)
          )} for you but something went wrong.`
        } else {
          message +=
            'To fix this error, make sure every page has a root layout.'
        }

        throw new Error(message)
      }

      // Clear fs cache, get the new result with the created root layout.
      filesInDir.clear()
      treeCodeResult = await createTreeCodeFromPath(pagePath, {
        page,
        resolveDir,
        resolver,
        metadataResolver,
        resolveParallelSegments,
        loaderContext: this,
        pageExtensions,
        basePath,
      })
    }
  }

  const pathname = new AppPathnameNormalizer().normalize(page)

  // Prefer to modify next/src/server/app-render/entry-base.ts since this is shared with Turbopack.
  // Any changes to this code should be reflected in Turbopack's app_source.rs and/or app-renderer.tsx as well.
  return await loadEntrypoint(
    'app-page',
    {
      VAR_DEFINITION_PAGE: page,
      VAR_DEFINITION_PATHNAME: pathname,
      VAR_MODULE_GLOBAL_ERROR: treeCodeResult.globalError,
      VAR_ORIGINAL_PATHNAME: page,
    },
    {
      tree: treeCodeResult.treeCode,
      pages: treeCodeResult.pages,
      __next_app_require__: '__webpack_require__',
      __next_app_load_chunk__: '() => Promise.resolve()',
    }
  )
}

export default nextAppLoader
