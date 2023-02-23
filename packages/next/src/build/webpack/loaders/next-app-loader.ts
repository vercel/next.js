import type webpack from 'webpack'
import type { ValueOf } from '../../../shared/lib/constants'
import type { ModuleReference, CollectedMetadata } from './metadata/types'

import path from 'path'
import chalk from 'next/dist/compiled/chalk'
import { NODE_RESOLVE_OPTIONS } from '../../webpack-config'
import { getModuleBuildInfo } from './get-module-build-info'
import { verifyRootLayout } from '../../../lib/verifyRootLayout'
import * as Log from '../../../build/output/log'
import { APP_DIR_ALIAS } from '../../../lib/constants'
import { buildMetadata, discoverStaticMetadataFiles } from './metadata/discover'

const isNotResolvedError = (err: any) => err.message.includes("Can't resolve")
import { isAppRouteRoute } from '../../../lib/is-app-route-route'

const FILE_TYPES = {
  layout: 'layout',
  template: 'template',
  error: 'error',
  loading: 'loading',
  head: 'head',
  'not-found': 'not-found',
} as const

const GLOBAL_ERROR_FILE_TYPE = 'global-error'
const PAGE_SEGMENT = 'page$'

type PathResolver = (
  pathname: string,
  resolveDir?: boolean
) => Promise<string | undefined>
export type ComponentsType = {
  readonly [componentKey in ValueOf<typeof FILE_TYPES>]?: ModuleReference
} & {
  readonly page?: ModuleReference
} & {
  readonly metadata?: CollectedMetadata
}

async function createAppRouteCode({
  pagePath,
  resolver,
}: {
  pagePath: string
  resolver: PathResolver
}): Promise<string> {
  // Split based on any specific path separators (both `/` and `\`)...
  const splittedPath = pagePath.split(/[\\/]/)
  // Then join all but the last part with the same separator, `/`...
  const segmentPath = splittedPath.slice(0, -1).join('/')
  // Then add the `/route` suffix...
  const matchedPagePath = `${segmentPath}/route`
  // This, when used with the resolver will give us the pathname to the built
  // route handler file.
  const resolvedPagePath = await resolver(matchedPagePath)

  // TODO: verify if other methods need to be injected
  // TODO: validate that the handler exports at least one of the supported methods

  return `
    import 'next/dist/server/node-polyfill-headers'

    export * as handlers from ${JSON.stringify(resolvedPagePath)}
    export const resolvedPagePath = ${JSON.stringify(resolvedPagePath)}

    export { staticGenerationAsyncStorage } from 'next/dist/client/components/static-generation-async-storage'
  
    export * as serverHooks from 'next/dist/client/components/hooks-server-context'
    
    export { staticGenerationBailout } from 'next/dist/client/components/static-generation-bailout'
    
    export * as headerHooks from 'next/dist/client/components/headers'
  
    export { requestAsyncStorage } from 'next/dist/client/components/request-async-storage'
  `
}

async function createTreeCodeFromPath(
  pagePath: string,
  {
    resolver,
    resolvePath,
    resolveParallelSegments,
    loaderContext,
    loaderOptions,
  }: {
    resolver: (
      pathname: string,
      resolveDir?: boolean
    ) => Promise<string | undefined>
    resolvePath: (pathname: string) => Promise<string>
    resolveParallelSegments: (
      pathname: string
    ) => [key: string, segment: string | string[]][]
    loaderContext: webpack.LoaderContext<AppLoaderOptions>
    loaderOptions: AppLoaderOptions
  }
) {
  const splittedPath = pagePath.split(/[\\/]/)
  const appDirPrefix = splittedPath[0]
  const pages: string[] = []

  let rootLayout: string | undefined
  let globalError: string | undefined

  async function createSubtreePropsFromSegmentPath(
    segments: string[]
  ): Promise<{
    treeCode: string
  }> {
    const segmentPath = segments.join('/')

    // Existing tree are the children of the current segment
    const props: Record<string, string> = {}
    const isRootLayer = segments.length === 0

    // We need to resolve all parallel routes in this level.
    const parallelSegments: [key: string, segment: string | string[]][] = []
    if (isRootLayer) {
      parallelSegments.push(['children', ''])
    } else {
      parallelSegments.push(...resolveParallelSegments(segmentPath))
    }

    let metadata: Awaited<ReturnType<typeof discoverStaticMetadataFiles>> = null
    try {
      const routerDirPath = `${appDirPrefix}${segmentPath}`
      const resolvedRouteDir = await resolver(routerDirPath, true)

      if (resolvedRouteDir) {
        metadata = await discoverStaticMetadataFiles(resolvedRouteDir, {
          resolvePath,
          isRootLayer,
          loaderContext,
          loaderOptions,
        })
      }
    } catch (err: any) {
      if (isNotResolvedError(err)) {
        throw err
      }
    }

    for (const [parallelKey, parallelSegment] of parallelSegments) {
      if (parallelSegment === PAGE_SEGMENT) {
        const matchedPagePath = `${appDirPrefix}${segmentPath}${
          parallelKey === 'children' ? '' : `/@${parallelKey}`
        }/page`

        const resolvedPagePath = await resolver(matchedPagePath)
        if (resolvedPagePath) pages.push(resolvedPagePath)

        // Use '' for segment as it's the page. There can't be a segment called '' so this is the safest way to add it.
        props[parallelKey] = `['', {}, {
          page: [() => import(/* webpackMode: "eager" */ ${JSON.stringify(
            resolvedPagePath
          )}), ${JSON.stringify(resolvedPagePath)}],
          ${buildMetadata(metadata)}
        }]`
        continue
      }

      const parallelSegmentPath = segmentPath + '/' + parallelSegment
      const { treeCode: subtreeCode } = await createSubtreePropsFromSegmentPath(
        [
          ...segments,
          ...(parallelKey === 'children' ? [] : [`@${parallelKey}`]),
          Array.isArray(parallelSegment) ? parallelSegment[0] : parallelSegment,
        ]
      )

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

      if (!rootLayout) {
        const layoutPath = filePaths.find(
          ([type, filePath]) => type === 'layout' && !!filePath
        )?.[1]
        rootLayout = layoutPath

        if (layoutPath) {
          globalError = await resolver(
            `${path.dirname(layoutPath)}/${GLOBAL_ERROR_FILE_TYPE}`
          )
        }
      }

      const definedFilePaths = filePaths.filter(
        ([, filePath]) => filePath !== undefined
      )
      props[parallelKey] = `[
        '${
          Array.isArray(parallelSegment) ? parallelSegment[0] : parallelSegment
        }',
        ${subtreeCode},
        {
          ${definedFilePaths
            .map(([file, filePath]) => {
              return `'${file}': [() => import(/* webpackMode: "eager" */ ${JSON.stringify(
                filePath
              )}), ${JSON.stringify(filePath)}],`
            })
            .join('\n')}
          ${definedFilePaths.length ? buildMetadata(metadata) : ''}
        }
      ]`
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

export type AppLoaderOptions = {
  name: string
  pagePath: string
  appDir: string
  appPaths: string[] | null
  pageExtensions: string[]
  basePath: string
  assetPrefix: string
  rootDir?: string
  tsconfigPath?: string
  isDev?: boolean
}
type AppLoader = webpack.LoaderDefinitionFunction<AppLoaderOptions>

const nextAppLoader: AppLoader = async function nextAppLoader() {
  const loaderOptions = this.getOptions() || {}
  const {
    name,
    appDir,
    appPaths,
    pagePath,
    pageExtensions,
    rootDir,
    tsconfigPath,
    isDev,
  } = loaderOptions

  const buildInfo = getModuleBuildInfo((this as any)._module)
  buildInfo.route = {
    page: name.replace(/^app/, ''),
    absolutePagePath: createAbsolutePath(appDir, pagePath),
  }

  const extensions = pageExtensions.map((extension) => `.${extension}`)
  const resolveOptions: any = {
    ...NODE_RESOLVE_OPTIONS,
    extensions,
  }
  const resolve = this.getResolve(resolveOptions)

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
          matched[rest[0].slice(1)] = PAGE_SEGMENT
          continue
        }

        if (isParallelRoute) {
          matched[rest[0].slice(1)] = rest.slice(1)
          continue
        }

        matched.children = rest[0]
      }
    }

    return Object.entries(matched)
  }
  const resolver: PathResolver = async (pathname, resolveDir) => {
    if (resolveDir) {
      return createAbsolutePath(appDir, pathname)
    }

    try {
      const resolved = await resolve(this.rootContext, pathname)
      this.addDependency(resolved)
      return resolved
    } catch (err: any) {
      const absolutePath = createAbsolutePath(appDir, pathname)
      for (const ext of extensions) {
        const absolutePathWithExtension = `${absolutePath}${ext}`
        this.addMissingDependency(absolutePathWithExtension)
      }
      if (isNotResolvedError(err)) {
        return undefined
      }
      throw err
    }
  }

  if (isAppRouteRoute(name)) {
    return createAppRouteCode({ pagePath, resolver })
  }

  const {
    treeCode,
    pages: pageListCode,
    rootLayout,
    globalError,
  } = await createTreeCodeFromPath(pagePath, {
    resolver,
    resolvePath: (pathname: string) => resolve(this.rootContext, pathname),
    resolveParallelSegments,
    loaderContext: this,
    loaderOptions: loaderOptions,
  })

  if (!rootLayout) {
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
    }
  }

  const result = `
    export ${treeCode}
    export ${pageListCode}

    export { default as AppRouter } from 'next/dist/client/components/app-router'
    export { default as LayoutRouter } from 'next/dist/client/components/layout-router'
    export { default as RenderFromTemplateContext } from 'next/dist/client/components/render-from-template-context'
    export { default as GlobalError } from ${JSON.stringify(
      globalError || 'next/dist/client/components/error-boundary'
    )}

    export { staticGenerationAsyncStorage } from 'next/dist/client/components/static-generation-async-storage'
    
    export { requestAsyncStorage } from 'next/dist/client/components/request-async-storage'

    export * as serverHooks from 'next/dist/client/components/hooks-server-context'

    export { renderToReadableStream } from 'next/dist/compiled/react-server-dom-webpack/server.edge'
    export const __next_app_webpack_require__ = __webpack_require__
  `

  return result
}

export default nextAppLoader
