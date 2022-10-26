import type webpack from 'webpack'
import chalk from 'next/dist/compiled/chalk'
import type { ValueOf } from '../../../shared/lib/constants'
import { NODE_RESOLVE_OPTIONS } from '../../webpack-config'
import { getModuleBuildInfo } from './get-module-build-info'
import { sep } from 'path'
import { verifyRootLayout } from '../../../lib/verifyRootLayout'
import * as Log from '../../../build/output/log'
import { APP_DIR_ALIAS } from '../../../lib/constants'

export const FILE_TYPES = {
  layout: 'layout',
  template: 'template',
  error: 'error',
  loading: 'loading',
  head: 'head',
  'not-found': 'not-found',
} as const

// TODO-APP: check if this can be narrowed.
type ComponentModule = () => any
export type ComponentsType = {
  readonly [componentKey in ValueOf<typeof FILE_TYPES>]?: ComponentModule
} & {
  readonly layoutOrPagePath?: string
  readonly page?: ComponentModule
}

async function createTreeCodeFromPath({
  pagePath,
  resolve,
  resolveParallelSegments,
}: {
  pagePath: string
  resolve: (pathname: string) => Promise<string | undefined>
  resolveParallelSegments: (
    pathname: string
  ) => [key: string, segment: string][]
}) {
  const splittedPath = pagePath.split(/[\\/]/)
  const appDirPrefix = splittedPath[0]
  const pages: string[] = []
  let rootLayout: string | undefined

  async function createSubtreePropsFromSegmentPath(
    segments: string[]
  ): Promise<string> {
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
      const parallelSegmentPath = segmentPath + '/' + parallelSegment

      if (parallelSegment === 'page') {
        const matchedPagePath = `${appDirPrefix}${parallelSegmentPath}`
        const resolvedPagePath = await resolve(matchedPagePath)
        if (resolvedPagePath) pages.push(resolvedPagePath)

        // Use '' for segment as it's the page. There can't be a segment called '' so this is the safest way to add it.
        props[parallelKey] = `['', {}, {layoutOrPagePath: ${JSON.stringify(
          resolvedPagePath
        )}, page: () => require(${JSON.stringify(resolvedPagePath)})}]`
        continue
      }

      const subtree = await createSubtreePropsFromSegmentPath([
        ...segments,
        parallelSegment,
      ])

      // `page` is not included here as it's added above.
      const filePaths = await Promise.all(
        Object.values(FILE_TYPES).map(async (file) => {
          return [
            file,
            await resolve(`${appDirPrefix}${parallelSegmentPath}/${file}`),
          ] as const
        })
      )

      if (!rootLayout) {
        rootLayout = filePaths.find(
          ([type, path]) => type === 'layout' && !!path
        )?.[1]
      }

      props[parallelKey] = `[
        '${parallelSegment}',
        ${subtree},
        {
          ${filePaths
            .filter(([, filePath]) => filePath !== undefined)
            .map(([file, filePath]) => {
              if (filePath === undefined) {
                return ''
              }
              return `${
                file === FILE_TYPES.layout
                  ? `layoutOrPagePath: ${JSON.stringify(filePath)},`
                  : ''
              }'${file}': () => require(${JSON.stringify(filePath)}),`
            })
            .join('\n')}
        }
      ]`
    }

    return `{
      ${Object.entries(props)
        .map(([key, value]) => `${key}: ${value}`)
        .join(',\n')}
    }`
  }

  const tree = await createSubtreePropsFromSegmentPath([])
  return [`const tree = ${tree}.children;`, pages, rootLayout]
}

function createAbsolutePath(appDir: string, pathToTurnAbsolute: string) {
  return (
    pathToTurnAbsolute
      // Replace all POSIX path separators with the current OS path separator
      .replace(/\//g, sep)
      .replace(/^private-next-app-dir/, appDir)
  )
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

  const normalizedAppPaths =
    typeof appPaths === 'string' ? [appPaths] : appPaths || []
  const resolveParallelSegments = (pathname: string) => {
    const matched: Record<string, string> = {}
    for (const path of normalizedAppPaths) {
      if (path.startsWith(pathname + '/')) {
        const restPath = path.slice(pathname.length + 1)

        const matchedSegment = restPath.split('/')[0]
        const matchedKey = matchedSegment.startsWith('@')
          ? matchedSegment.slice(1)
          : 'children'
        matched[matchedKey] = matchedSegment
      }
    }
    return Object.entries(matched)
  }

  const resolver = async (pathname: string) => {
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

  const [treeCode, pages, rootLayout] = await createTreeCodeFromPath({
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
    export const pages = ${JSON.stringify(pages)}

    export const AppRouter = require('next/dist/client/components/app-router.js').default
    export const LayoutRouter = require('next/dist/client/components/layout-router.js').default
    export const RenderFromTemplateContext = require('next/dist/client/components/render-from-template-context.js').default

    export const staticGenerationAsyncStorage = require('next/dist/client/components/static-generation-async-storage').staticGenerationAsyncStorage
    export const requestAsyncStorage = require('next/dist/client/components/request-async-storage.js').requestAsyncStorage

    export const serverHooks = require('next/dist/client/components/hooks-server-context.js')

    export const renderToReadableStream = require('next/dist/compiled/react-server-dom-webpack/server.browser').renderToReadableStream
    export const __next_app_webpack_require__ = __webpack_require__
  `

  return result
}

export default nextAppLoader
