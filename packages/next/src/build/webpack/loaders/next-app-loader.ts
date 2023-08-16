import type webpack from 'webpack'
import type { ValueOf } from '../../../shared/lib/constants'
import type { ModuleReference, CollectedMetadata } from './metadata/types'

import path from 'path'
import { stringify } from 'querystring'
import chalk from 'next/dist/compiled/chalk'
import { getModuleBuildInfo } from './get-module-build-info'
import { verifyRootLayout } from '../../../lib/verifyRootLayout'
import * as Log from '../../output/log'
import { APP_DIR_ALIAS, WEBPACK_RESOURCE_QUERIES } from '../../../lib/constants'
import {
  createMetadataExportsCode,
  createStaticMetadataFromRoute,
} from './metadata/discover'
import { promises as fs } from 'fs'
import { isAppRouteRoute } from '../../../lib/is-app-route-route'
import { isMetadataRoute } from '../../../lib/metadata/is-metadata-route'
import { NextConfig } from '../../../server/config-shared'
import { AppPathnameNormalizer } from '../../../server/future/normalizers/built/app/app-pathname-normalizer'
import { RouteKind } from '../../../server/future/route-kind'
import { AppRouteRouteModuleOptions } from '../../../server/future/route-modules/app-route/module'
import { AppBundlePathNormalizer } from '../../../server/future/normalizers/built/app/app-bundle-path-normalizer'
import { FileType, fileExists } from '../../../lib/file-exists'
import { MiddlewareConfig } from '../../analysis/get-page-static-info'

export type AppLoaderOptions = {
  name: string
  page: string
  pagePath: string
  appDir: string
  appPaths: readonly string[] | null
  preferredRegion: string | string[] | undefined
  pageExtensions: string[]
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

type DirResolver = (pathToResolve: string) => string
type PathResolver = (
  pathname: string
) => Promise<string | undefined> | string | undefined
export type MetadataResolver = (
  pathname: string,
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
  pageExtensions: string[]
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
    resolvedPagePath = `next-metadata-route-loader?${stringify({
      page,
      pageExtensions,
    })}!${resolvedPagePath + '?' + WEBPACK_RESOURCE_QUERIES.metadata}`
  }

  // References the route handler file to load found in `./routes/${kind}.ts`.
  // TODO: allow switching to the different kinds of routes
  const kind = 'app-route'
  const pathname = new AppPathnameNormalizer().normalize(page)
  const bundlePath = new AppBundlePathNormalizer().normalize(page)

  // This is providing the options defined by the route options type found at
  // ./routes/${kind}.ts. This is stringified here so that the literal for
  // `userland` can reference the variable for `userland` that's in scope for
  // the loader code.
  const options: Omit<AppRouteRouteModuleOptions, 'userland'> = {
    definition: {
      kind: RouteKind.APP_ROUTE,
      page,
      pathname,
      filename,
      bundlePath,
    },
    resolvedPagePath,
    nextConfigOutput,
  }

  return `
    import 'next/dist/server/node-polyfill-headers'

    import RouteModule from 'next/dist/server/future/route-modules/${kind}/module'

    import * as userland from ${JSON.stringify(resolvedPagePath)}

    const options = ${JSON.stringify(options)}
    const routeModule = new RouteModule({
      ...options,
      userland,
    })

    // Pull out the exports that we need to expose from the module. This should
    // be eliminated when we've moved the other routes to the new format. These
    // are used to hook into the route.
    const {
      requestAsyncStorage,
      staticGenerationAsyncStorage,
      serverHooks,
      headerHooks,
      staticGenerationBailout
    } = routeModule

    const originalPathname = "${page}"

    export {
      routeModule,
      requestAsyncStorage,
      staticGenerationAsyncStorage,
      serverHooks,
      headerHooks,
      staticGenerationBailout,
      originalPathname
    }`
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
    resolveDir,
    resolver,
    resolveParallelSegments,
    metadataResolver,
    pageExtensions,
    basePath,
  }: {
    resolveDir: DirResolver
    resolver: PathResolver
    metadataResolver: MetadataResolver
    resolveParallelSegments: (
      pathname: string
    ) => [key: string, segment: string | string[]][]
    loaderContext: webpack.LoaderContext<AppLoaderOptions>
    pageExtensions: string[]
    basePath: string
  }
): Promise<{
  treeCode: string
  pages: string
  rootLayout: string | undefined
  globalError: string | undefined
}> {
  const splittedPath = pagePath.split(/[\\/]/)
  const appDirPrefix = splittedPath[0]
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
    const files = await fs.readdir(absoluteSegmentPath)

    const parallelSegments: string[] = ['children']

    await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(absoluteSegmentPath, file)
        const stat = await fs.stat(filePath)

        if (stat.isDirectory() && file.startsWith('@')) {
          parallelSegments.push(file)
        }
      })
    )

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
    const resolvedRouteDir = await resolveDir(routerDirPath)

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
        props[normalizeParallelKey(parallelKey)] = `['__PAGE__', {}, {
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

      const { treeCode: subtreeCode } = await createSubtreePropsFromSegmentPath(
        subSegmentPath
      )

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

      if (!rootLayout) {
        const layoutPath = definedFilePaths.find(
          ([type]) => type === 'layout'
        )?.[1]
        rootLayout = layoutPath

        if (layoutPath) {
          globalError = await resolver(
            `${path.dirname(layoutPath)}/${GLOBAL_ERROR_FILE_TYPE}`
          )
        }
      }

      let parallelSegmentKey = Array.isArray(parallelSegment)
        ? parallelSegment[0]
        : parallelSegment

      parallelSegmentKey =
        parallelSegmentKey === PARALLEL_CHILDREN_SEGMENT
          ? 'children'
          : parallelSegmentKey

      props[normalizeParallelKey(parallelKey)] = `[
        '${parallelSegmentKey}',
        ${subtreeCode},
        {
          ${definedFilePaths
            .map(([file, filePath]) => {
              return `'${file}': [() => import(/* webpackMode: "eager" */ ${JSON.stringify(
                filePath
              )}), ${JSON.stringify(filePath)}],`
            })
            .join('\n')}
          ${createMetadataExportsCode(metadata)}
        }
      ]`
    }

    const adjacentParallelSegments = await resolveAdjacentParallelSegments(
      segmentPath
    )

    for (const adjacentParallelSegment of adjacentParallelSegments) {
      if (!props[normalizeParallelKey(adjacentParallelSegment)]) {
        const actualSegment =
          adjacentParallelSegment === 'children' ? '' : adjacentParallelSegment
        const defaultPath =
          (await resolver(
            `${appDirPrefix}${segmentPath}/${actualSegment}/default`
          )) ?? 'next/dist/client/components/parallel-route-default'

        props[normalizeParallelKey(adjacentParallelSegment)] = `[
          '__DEFAULT__',
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
    treeCode: `const tree = ${treeCode}.children;`,
    pages: `const pages = ${JSON.stringify(pages)};`,
    rootLayout,
    globalError,
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
    for (const appPath of normalizedAppPaths) {
      if (appPath.startsWith(pathname + '/')) {
        const rest = appPath.slice(pathname.length + 1).split('/')

        // It is the actual page, mark it specially.
        if (rest.length === 1 && rest[0] === 'page') {
          matched.children = PAGE_SEGMENT
          continue
        }

        const isParallelRoute = rest[0].startsWith('@')
        if (isParallelRoute && rest.length === 2 && rest[1] === 'page') {
          matched[rest[0]] = [PAGE_SEGMENT]
          continue
        }
        if (isParallelRoute) {
          // we insert a special marker in order to also process layout/etc files at the slot level
          matched[rest[0]] = [PARALLEL_CHILDREN_SEGMENT, ...rest.slice(1)]
          continue
        }

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

  const resolver: PathResolver = async (pathname) => {
    const absolutePath = createAbsolutePath(appDir, pathname)

    let result: string | undefined

    for (const ext of extensions) {
      const absolutePathWithExtension = `${absolutePath}${ext}`
      if (
        !result &&
        (await fileExists(absolutePathWithExtension, FileType.File))
      ) {
        // Ensures we call `addMissingDependency` for all files that didn't match
        result = absolutePathWithExtension
      } else {
        this.addMissingDependency(absolutePathWithExtension)
      }
    }

    return result
  }

  const metadataResolver: MetadataResolver = async (pathname, exts) => {
    const absolutePath = createAbsolutePath(appDir, pathname)

    let result: string | undefined

    for (const ext of exts) {
      // Compared to `resolver` above the exts do not have the `.` included already, so it's added here.
      const absolutePathWithExtension = `${absolutePath}.${ext}`
      if (
        !result &&
        (await fileExists(absolutePathWithExtension, FileType.File))
      ) {
        result = absolutePathWithExtension
      } else {
        this.addMissingDependency(absolutePathWithExtension)
      }
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
        `${chalk.bold(
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
        let message = `${chalk.bold(
          pagePath.replace(`${APP_DIR_ALIAS}/`, '')
        )} doesn't have a root layout. `

        if (rootLayoutPath) {
          message += `We tried to create ${chalk.bold(
            path.relative(this._compiler?.context ?? '', rootLayoutPath)
          )} for you but something went wrong.`
        } else {
          message +=
            'To fix this error, make sure every page has a root layout.'
        }

        throw new Error(message)
      }

      // Get the new result with the created root layout.
      treeCodeResult = await createTreeCodeFromPath(pagePath, {
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

  const result = `
    export ${treeCodeResult.treeCode}
    export ${treeCodeResult.pages}

    export { default as AppRouter } from 'next/dist/client/components/app-router'
    export { default as LayoutRouter } from 'next/dist/client/components/layout-router'
    export { default as RenderFromTemplateContext } from 'next/dist/client/components/render-from-template-context'
    export { default as GlobalError } from ${JSON.stringify(
      treeCodeResult.globalError || 'next/dist/client/components/error-boundary'
    )}

    export { staticGenerationAsyncStorage } from 'next/dist/client/components/static-generation-async-storage'

    export { requestAsyncStorage } from 'next/dist/client/components/request-async-storage'
    export { actionAsyncStorage } from 'next/dist/client/components/action-async-storage'

    export { staticGenerationBailout } from 'next/dist/client/components/static-generation-bailout'
    export { default as StaticGenerationSearchParamsBailoutProvider } from 'next/dist/client/components/static-generation-searchparams-bailout-provider'
    export { createSearchParamsBailoutProxy } from 'next/dist/client/components/searchparams-bailout-proxy'

    export * as serverHooks from 'next/dist/client/components/hooks-server-context'

    export { renderToReadableStream, decodeReply, decodeAction } from 'react-server-dom-webpack/server.edge'
    export const __next_app_webpack_require__ = __webpack_require__
    export { preloadStyle, preloadFont, preconnect } from 'next/dist/server/app-render/rsc/preloads'

    export const originalPathname = "${page}"
  `

  return result
}

export default nextAppLoader
