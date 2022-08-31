import type webpack from 'webpack'
import { NODE_RESOLVE_OPTIONS } from '../../webpack-config'
import { getModuleBuildInfo } from './get-module-build-info'

async function createTreeCodeFromPath({
  pagePath,
  resolve,
  resolveParallelSegments,
}: {
  pagePath: string
  resolve: (pathname: string) => Promise<string | undefined>
  resolveParallelSegments: (pathname: string) => string[]
}) {
  const splittedPath = pagePath.split(/[\\/]/)
  const appDirPrefix = splittedPath[0]

  async function createSubtreePropsFromSegmentPath(
    segments: string[]
  ): Promise<string> {
    const segmentPath = segments.join('/')

    // Last item in the list is the page which can't have layouts by itself
    if (
      segments[segments.length - 1] === 'page' ||
      segments[segments.length - 1]?.endsWith('/page')
    ) {
      const matchedPagePath = `${appDirPrefix}${segmentPath}`
      const resolvedPagePath = await resolve(matchedPagePath)
      // Use '' for segment as it's the page. There can't be a segment called '' so this is the safest way to add it.
      return `{
        children: ${`['', {}, {filePath: ${JSON.stringify(
          resolvedPagePath
        )}, page: () => require(${JSON.stringify(resolvedPagePath)})}]`}
      }`
    }

    // Existing tree are the children of the current segment
    const props: Record<string, string> = {}

    // We need to resolve all parallel routes in this level.
    const parallelSegments: string[] = []
    if (segments.length === 0) {
      parallelSegments.push('')
    } else {
      parallelSegments.push(...resolveParallelSegments(segmentPath))
    }

    for (const parallelSegment of parallelSegments) {
      const parallelSegmentPath = segmentPath + '/' + parallelSegment
      const subtree = await createSubtreePropsFromSegmentPath([
        ...segments,
        parallelSegment,
      ])

      // For segmentPath === '' avoid double `/`
      const layoutPath = `${appDirPrefix}${parallelSegmentPath}/layout`
      // For segmentPath === '' avoid double `/`
      const loadingPath = `${appDirPrefix}${parallelSegmentPath}/loading`

      const resolvedLayoutPath = await resolve(layoutPath)
      const resolvedLoadingPath = await resolve(loadingPath)

      const matchedSlot = parallelSegment.match(/@(.+)/)
      const segmentKey = matchedSlot ? matchedSlot[1] : 'children'

      props[segmentKey] = `[
        '${parallelSegment}',
        ${subtree},
        {
          filePath: ${JSON.stringify(resolvedLayoutPath)},
          ${
            resolvedLayoutPath
              ? `layout: () => require(${JSON.stringify(resolvedLayoutPath)}),`
              : ''
          }
          ${
            resolvedLoadingPath
              ? `loading: () => require(${JSON.stringify(
                  resolvedLoadingPath
                )}),`
              : ''
          }
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
  return `const tree = ${tree}.children;`
}

function createAbsolutePath(appDir: string, pathToTurnAbsolute: string) {
  return pathToTurnAbsolute.replace(/^private-next-app-dir/, appDir)
}

const nextAppLoader: webpack.LoaderDefinitionFunction<{
  name: string
  pagePath: string
  appDir: string
  appPaths: string[] | null
  pageExtensions: string[]
}> = async function nextAppLoader() {
  const { name, appDir, appPaths, pagePath, pageExtensions } =
    this.getOptions() || {}

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
    const matched = new Set<string>()
    for (const path of normalizedAppPaths) {
      if (path.startsWith(pathname + '/')) {
        const restPath = path.slice(pathname.length + 1)

        const pathSegments = restPath.split('/')
        let matchedSegments = ''
        for (const segment of pathSegments) {
          if (matchedSegments) {
            matchedSegments += '/'
          }
          if (segment.startsWith('(')) {
            // Include all prefixed (...) segments.
            matchedSegments += segment
          } else {
            matchedSegments += segment
            break
          }
        }
        matched.add(matchedSegments)
      }
    }
    return Array.from(matched)
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

  const treeCode = await createTreeCodeFromPath({
    pagePath,
    resolve: resolver,
    resolveParallelSegments,
  })

  const result = `
    export ${treeCode}

    export const AppRouter = require('next/dist/client/components/app-router.client.js').default
    export const LayoutRouter = require('next/dist/client/components/layout-router.client.js').default
    export const HotReloader = ${
      // Disable HotReloader component in production
      this.mode === 'development'
        ? `require('next/dist/client/components/hot-reloader.client.js').default`
        : 'null'
    }

    export const __next_app_webpack_require__ = __webpack_require__
  `

  return result
}

export default nextAppLoader
