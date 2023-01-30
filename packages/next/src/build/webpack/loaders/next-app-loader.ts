import type webpack from 'webpack'
import chalk from 'next/dist/compiled/chalk'
import type { ValueOf } from '../../../shared/lib/constants'
import { NODE_RESOLVE_OPTIONS } from '../../webpack-config'
import { getModuleBuildInfo } from './get-module-build-info'
import { sep } from 'path'
import { verifyRootLayout } from '../../../lib/verifyRootLayout'
import * as Log from '../../../build/output/log'
import { APP_DIR_ALIAS } from '../../../lib/constants'
import { isAppRoute } from '../../../lib/is-app-route'

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

// TODO-APP: check if this can be narrowed.
type ComponentModule = () => any
type ModuleReference = [componentModule: ComponentModule, filePath: string]
type PathResolver = (
  pathname: string,
  resolveDir?: boolean
) => Promise<string | undefined>
export type ComponentsType = {
  readonly [componentKey in ValueOf<typeof FILE_TYPES>]?: ModuleReference
} & {
  readonly page?: ModuleReference
}

async function createTreeCodeFromPath({
  pagePath,
  resolve,
  resolveParallelSegments,
}: {
  pagePath: string
  resolve: PathResolver
  resolveParallelSegments: (
    pathname: string
  ) => [key: string, segment: string][]
}) {
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

    // We need to resolve all parallel routes in this level.
    const parallelSegments: [key: string, segment: string][] = []
    if (segments.length === 0) {
      parallelSegments.push(['children', ''])
    } else {
      parallelSegments.push(...resolveParallelSegments(segmentPath))
    }

    for (const [parallelKey, parallelSegment] of parallelSegments) {
      if (parallelSegment === PAGE_SEGMENT) {
        const matchedPagePath = `${appDirPrefix}${segmentPath}/page`
        const resolvedPagePath = await resolve(matchedPagePath)
        if (resolvedPagePath) pages.push(resolvedPagePath)

        // Use '' for segment as it's the page. There can't be a segment called '' so this is the safest way to add it.
        props[parallelKey] = `['', {}, {
          page: [() => import(/* webpackMode: "eager" */ ${JSON.stringify(
            resolvedPagePath
          )}), ${JSON.stringify(resolvedPagePath)}]}]`
        continue
      }

      const parallelSegmentPath = segmentPath + '/' + parallelSegment
      const { treeCode: subtreeCode } = await createSubtreePropsFromSegmentPath(
        [...segments, parallelSegment]
      )

      // `page` is not included here as it's added above.
      const filePaths = await Promise.all(
        Object.values(FILE_TYPES).map(async (file) => {
          return [
            file,
            await resolve(`${appDirPrefix}${parallelSegmentPath}/${file}`),
          ] as const
        })
      )

      const layoutPath = filePaths.find(
        ([type, path]) => type === 'layout' && !!path
      )?.[1]
      if (!rootLayout) {
        rootLayout = layoutPath
      }

      if (!rootLayout) {
        rootLayout = layoutPath
      }

      if (!globalError) {
        globalError = await resolve(
          `${appDirPrefix}${parallelSegmentPath}/${GLOBAL_ERROR_FILE_TYPE}`
        )
      }

      props[parallelKey] = `[
        '${parallelSegment}',
        ${subtreeCode},
        {
          ${filePaths
            .filter(([, filePath]) => filePath !== undefined)
            .map(([file, filePath]) => {
              if (filePath === undefined) {
                return ''
              }

              return `'${file}': [() => import(/* webpackMode: "eager" */ ${JSON.stringify(
                filePath
              )}), ${JSON.stringify(filePath)}],`
            })
            .join('\n')}
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
      .replace(/\//g, sep)
      .replace(/^private-next-app-dir/, appDir)
  )
}

async function createCustomAppRouteCode({
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
  // TODO: is there a way to test/validate that the outputted string template is type correct? Suggest adding type here to reference by the importer.
  // TODO: validate that the handler exports at least one of the supported methods

  return `
    import 'next/dist/server/node-polyfill-headers'
    
    export * as handlers from ${JSON.stringify(resolvedPagePath)}

    export { requestAsyncStorage } from 'next/dist/client/components/request-async-storage'
  `
}

const nextAppLoader: webpack.LoaderDefinitionFunction<{
  name: string
  pagePath: string
  appDir: string
  appPaths: string[] | null
  pageExtensions: string[]
  rootDir?: string
  tsconfigPath?: string
  isDev?: boolean
}> = async function nextAppLoader() {
  const {
    name,
    appDir,
    appPaths,
    pagePath,
    pageExtensions,
    rootDir,
    tsconfigPath,
    isDev,
  } = this.getOptions() || {}

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
      if (err.message.includes("Can't resolve")) {
        return undefined
      }
      throw err
    }
  }

  if (isAppRoute(name)) {
    return createCustomAppRouteCode({ pagePath, resolver })
  }

  const normalizedAppPaths =
    typeof appPaths === 'string' ? [appPaths] : appPaths || []

  const resolveParallelSegments = (pathname: string) => {
    const matched: Record<string, string> = {}
    for (const path of normalizedAppPaths) {
      if (path.startsWith(pathname + '/')) {
        const rest = path.slice(pathname.length + 1).split('/')

        let matchedSegment = rest[0]

        const matchedKey = matchedSegment.startsWith('@')
          ? matchedSegment.slice(1)
          : 'children'

        // It is the actual page, mark it.
        if (rest.length === 1 && matchedSegment === 'page') {
          matchedSegment = PAGE_SEGMENT
        }

        matched[matchedKey] = matchedSegment
      }
    }
    return Object.entries(matched)
  }

  const {
    treeCode,
    pages: pageListCode,
    rootLayout,
    globalError,
  } = await createTreeCodeFromPath({
    pagePath,
    resolve: resolver,
    resolveParallelSegments,
  })

  if (!rootLayout) {
    const errorMessage = `${chalk.bold(
      pagePath.replace(`${APP_DIR_ALIAS}/`, '')
    )} doesn't have a root layout. To fix this error, make sure every page has a root layout.`

    if (!isDev) {
      // If we're building and missing a root layout, exit the build
      Log.error(errorMessage)
      process.exit(1)
    } else {
      // In dev we'll try to create a root layout
      const createdRootLayout = await verifyRootLayout({
        appDir: appDir,
        dir: rootDir!,
        tsconfigPath: tsconfigPath!,
        pagePath,
        pageExtensions,
      })
      if (!createdRootLayout) {
        throw new Error(errorMessage)
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

    export { renderToReadableStream } from 'next/dist/compiled/react-server-dom-webpack/server.browser'
    export const __next_app_webpack_require__ = __webpack_require__
  `

  return result
}

export default nextAppLoader
