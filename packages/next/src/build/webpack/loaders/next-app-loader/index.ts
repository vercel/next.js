import type webpack from 'next/dist/compiled/webpack/webpack'
import {
  UNDERSCORE_GLOBAL_ERROR_ROUTE,
  UNDERSCORE_NOT_FOUND_ROUTE,
  type ValueOf,
} from '../../../../shared/lib/constants'
import {
  UNDERSCORE_GLOBAL_ERROR_ROUTE_ENTRY,
  UNDERSCORE_NOT_FOUND_ROUTE_ENTRY,
} from '../../../../shared/lib/entry-constants'
import type { ModuleTuple, CollectedMetadata } from '../metadata/types'

import path from 'path'
import { bold } from '../../../../lib/picocolors'
import { getModuleBuildInfo } from '../get-module-build-info'
import { verifyRootLayout } from '../../../../lib/verify-root-layout'
import * as Log from '../../../output/log'
import { APP_DIR_ALIAS } from '../../../../lib/constants'
import {
  createMetadataExportsCode,
  createStaticMetadataFromRoute,
} from '../metadata/discover'
import { promises as fs } from 'fs'
import { isAppRouteRoute } from '../../../../lib/is-app-route-route'
import type { NextConfig } from '../../../../server/config-shared'
import { AppPathnameNormalizer } from '../../../../server/normalizers/built/app/app-pathname-normalizer'
import type { ProxyConfig } from '../../../analysis/get-page-static-info'
import { isAppBuiltinPage } from '../../../utils'
import { loadEntrypoint } from '../../../load-entrypoint'
import {
  isGroupSegment,
  DEFAULT_SEGMENT_KEY,
  PAGE_SEGMENT_KEY,
} from '../../../../shared/lib/segment'
import { getFilesInDir } from '../../../../lib/get-files-in-dir'
import type { PageExtensions } from '../../../page-extensions-type'
import { PARALLEL_ROUTE_DEFAULT_PATH } from '../../../../client/components/builtin/default'
import type { Compilation } from 'webpack'
import { createAppRouteCode } from './create-app-route-code'
import { MissingDefaultParallelRouteError } from '../../../../shared/lib/errors/missing-default-parallel-route-error'

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
  isDev?: true
  basePath: string
  nextConfigOutput?: NextConfig['output']
  middlewareConfig: string
  isGlobalNotFoundEnabled: true | undefined
}
type AppLoader = webpack.LoaderDefinitionFunction<AppLoaderOptions>

const HTTP_ACCESS_FALLBACKS = {
  'not-found': 'not-found',
  forbidden: 'forbidden',
  unauthorized: 'unauthorized',
} as const
const defaultHTTPAccessFallbackPaths = {
  'not-found': 'next/dist/client/components/builtin/not-found.js',
  forbidden: 'next/dist/client/components/builtin/forbidden.js',
  unauthorized: 'next/dist/client/components/builtin/unauthorized.js',
} as const

const FILE_TYPES = {
  layout: 'layout',
  template: 'template',
  error: 'error',
  loading: 'loading',
  'global-error': 'global-error',
  'global-not-found': 'global-not-found',
  ...HTTP_ACCESS_FALLBACKS,
} as const

const GLOBAL_ERROR_FILE_TYPE = 'global-error'
const GLOBAL_NOT_FOUND_FILE_TYPE = 'global-not-found'
const PAGE_SEGMENT = 'page$'
const PARALLEL_VIRTUAL_SEGMENT = 'slot$'

const defaultGlobalErrorPath =
  'next/dist/client/components/builtin/global-error.js'
const defaultNotFoundPath = 'next/dist/client/components/builtin/not-found.js'
const defaultEmptyStubPath = 'next/dist/client/components/builtin/empty-stub'
const defaultLayoutPath = 'next/dist/client/components/builtin/layout.js'
const defaultGlobalNotFoundPath =
  'next/dist/client/components/builtin/global-not-found.js'
const appErrorPath = 'next/dist/client/components/builtin/app-error.js'

type DirResolver = (pathToResolve: string) => string
type PathResolver = (
  pathname: string
) => Promise<string | undefined> | string | undefined
export type MetadataResolver = (
  dir: string,
  filename: string,
  extensions: readonly string[]
) => Promise<string | undefined>

export type AppDirModules = {
  readonly [moduleKey in ValueOf<typeof FILE_TYPES>]?: ModuleTuple
} & {
  readonly page?: ModuleTuple
} & {
  readonly metadata?: CollectedMetadata
} & {
  readonly defaultPage?: ModuleTuple
}

const normalizeParallelKey = (key: string) =>
  key.startsWith('@') ? key.slice(1) : key

const isCatchAllSegment = (segment: string) =>
  segment.startsWith('[...') || segment.startsWith('[[...')

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
    hasChildRoutesForSegment,
    metadataResolver,
    pageExtensions,
    basePath,
    collectedDeclarations,
    isGlobalNotFoundEnabled,
  }: {
    page: string
    resolveDir: DirResolver
    resolver: PathResolver
    metadataResolver: MetadataResolver
    resolveParallelSegments: (
      pathname: string
    ) => [key: string, segment: string | string[]][]
    hasChildRoutesForSegment: (segmentPath: string) => boolean
    loaderContext: webpack.LoaderContext<AppLoaderOptions>
    pageExtensions: PageExtensions
    basePath: string
    collectedDeclarations: [string, string][]
    isGlobalNotFoundEnabled: boolean
  }
): Promise<{
  treeCode: string
  rootLayout: string | undefined
  globalError: string
  globalNotFound: string
}> {
  const splittedPath = pagePath.split(/[\\/]/, 1)
  const isNotFoundRoute = page === UNDERSCORE_NOT_FOUND_ROUTE_ENTRY
  const isAppErrorRoute = page === UNDERSCORE_GLOBAL_ERROR_ROUTE_ENTRY
  const isDefaultNotFound = isAppBuiltinPage(pagePath)

  const appDirPrefix = isDefaultNotFound ? APP_DIR_ALIAS : splittedPath[0]

  let rootLayout: string | undefined
  let globalError: string = defaultGlobalErrorPath
  let globalNotFound: string = defaultNotFoundPath

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
    segments: string[],
    nestedCollectedDeclarations: [string, string][]
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
    const resolvedRouteDir = resolveDir(routerDirPath)

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
      // if parallelSegment is the page segment (ie, `page$` and not ['page$']), it gets loaded into the __PAGE__ slot
      // as it's the page for the current route.
      if (parallelSegment === PAGE_SEGMENT) {
        const matchedPagePath = `${appDirPrefix}${segmentPath}${
          parallelKey === 'children' ? '' : `/${parallelKey}`
        }/page`

        const resolvedPagePath = await resolver(matchedPagePath)
        if (resolvedPagePath) {
          const varName = `page${nestedCollectedDeclarations.length}`
          nestedCollectedDeclarations.push([varName, resolvedPagePath])

          // Use '' for segment as it's the page. There can't be a segment called '' so this is the safest way to add it.
          props[normalizeParallelKey(parallelKey)] =
            `['${PAGE_SEGMENT_KEY}', {}, {
          page: [${varName}, ${JSON.stringify(resolvedPagePath)}],
          ${createMetadataExportsCode(metadata)}
        }]`
          continue
        } else {
          throw new Error(`Can't resolve ${matchedPagePath}`)
        }
      }

      // if the parallelSegment was not matched to the __PAGE__ slot, then it's a parallel route at this level.
      // the code below recursively traverses the parallel slots directory to match the corresponding __PAGE__ for each parallel slot
      // while also filling in layout/default/etc files into the loader tree at each segment level.

      const subSegmentPath = [...segments]
      if (parallelKey !== 'children') {
        // A `children` parallel key should have already been processed in the above segment
        // So we exclude it when constructing the subsegment path for the remaining segment levels
        subSegmentPath.push(parallelKey)
      }

      const normalizedParallelSegment = Array.isArray(parallelSegment)
        ? parallelSegment[0]
        : parallelSegment

      if (
        normalizedParallelSegment !== PAGE_SEGMENT &&
        normalizedParallelSegment !== PARALLEL_VIRTUAL_SEGMENT
      ) {
        // If we don't have a page segment, nor a special $children marker, it means we need to traverse the next directory
        // (ie, `normalizedParallelSegment` would correspond with the folder that contains the next level of pages/layout/etc)
        // we push it to the subSegmentPath so that we can fill in the loader tree for that segment.
        subSegmentPath.push(normalizedParallelSegment)
      }

      const parallelSegmentPath = subSegmentPath.join('/')

      // Fill in the loader tree for all of the special files types (layout, default, etc) at this level
      // `page` is not included here as it's added above.
      const filePathEntries = await Promise.all(
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
      const filePaths = new Map<ValueOf<typeof FILE_TYPES>, string | undefined>(
        filePathEntries
      )

      // Only resolve global-* convention files at the root layer
      if (isRootLayer) {
        const resolvedGlobalErrorPath = await resolver(
          `${appDirPrefix}/${GLOBAL_ERROR_FILE_TYPE}`
        )
        if (resolvedGlobalErrorPath) {
          globalError = resolvedGlobalErrorPath
        }
        // Add global-error to root layer's filePaths, so that it's always available,
        // by default it's the built-in global-error.js
        filePaths.set(GLOBAL_ERROR_FILE_TYPE, globalError)

        // TODO(global-not-found): remove this flag assertion condition
        //  once global-not-found is stable
        if (isGlobalNotFoundEnabled) {
          const resolvedGlobalNotFoundPath = await resolver(
            `${appDirPrefix}/${GLOBAL_NOT_FOUND_FILE_TYPE}`
          )
          if (resolvedGlobalNotFoundPath) {
            globalNotFound = resolvedGlobalNotFoundPath
          }
          // Add global-not-found to root layer's filePaths, so that it's always available,
          // by default it's the built-in global-not-found.js
          filePaths.set(GLOBAL_NOT_FOUND_FILE_TYPE, globalNotFound)
        }
      }

      let definedFilePaths = Array.from(filePaths.entries()).filter(
        ([, filePath]) => filePath !== undefined
      ) as [ValueOf<typeof FILE_TYPES>, string][]

      // Add default access fallback as root fallback if not present
      const existedConventionNames = new Set(
        definedFilePaths.map(([type]) => type)
      )
      // If the first layer is a group route, we treat it as root layer
      const isFirstLayerGroupRoute =
        segments.length === 1 &&
        subSegmentPath.filter((seg) => isGroupSegment(seg)).length === 1

      if (isRootLayer || isFirstLayerGroupRoute) {
        const accessFallbackTypes = Object.keys(
          defaultHTTPAccessFallbackPaths
        ) as (keyof typeof defaultHTTPAccessFallbackPaths)[]
        for (const type of accessFallbackTypes) {
          const hasRootFallbackFile = await resolver(
            `${appDirPrefix}/${FILE_TYPES[type]}`
          )
          const hasLayerFallbackFile = existedConventionNames.has(type)

          // If you already have a root access error fallback, don't insert default access error boundary to group routes root
          if (
            // Is treated as root layout and without boundary
            !(hasRootFallbackFile && isFirstLayerGroupRoute) &&
            // Does not have a fallback boundary file
            !hasLayerFallbackFile
          ) {
            const defaultFallbackPath = defaultHTTPAccessFallbackPaths[type]
            if (!(isDefaultNotFound && type === 'not-found')) {
              definedFilePaths.push([type, defaultFallbackPath])
            }
          }
        }
      }

      if (!rootLayout) {
        const layoutPath = definedFilePaths.find(
          ([type]) => type === 'layout'
        )?.[1]
        rootLayout = layoutPath

        // When `global-not-found` is disabled, we insert a default layout if
        // root layout is presented. This logic and the default layout will be removed
        // once `global-not-found` is stabilized.
        if (
          !isGlobalNotFoundEnabled &&
          isDefaultNotFound &&
          !layoutPath &&
          !rootLayout
        ) {
          rootLayout = defaultLayoutPath
          definedFilePaths.push(['layout', rootLayout])
        }
      }

      let parallelSegmentKey = Array.isArray(parallelSegment)
        ? parallelSegment[0]
        : parallelSegment

      // normalize the parallel segment key to remove any special markers that we inserted in the
      // earlier logic (such as children$ and page$). These should never appear in the loader tree, and
      // should instead be the corresponding segment keys (ie `__PAGE__`) or the `children` parallel route.
      parallelSegmentKey =
        parallelSegmentKey === PARALLEL_VIRTUAL_SEGMENT
          ? '(slot)'
          : parallelSegmentKey === PAGE_SEGMENT
            ? PAGE_SEGMENT_KEY
            : parallelSegmentKey

      const normalizedParallelKey = normalizeParallelKey(parallelKey)
      let subtreeCode: string | undefined
      // If it's root not found page, set not-found boundary as children page
      if (isNotFoundRoute) {
        if (normalizedParallelKey === 'children') {
          const matchedGlobalNotFound = isGlobalNotFoundEnabled
            ? (definedFilePaths.find(
                ([type]) => type === GLOBAL_NOT_FOUND_FILE_TYPE
              )?.[1] ?? defaultGlobalNotFoundPath)
            : undefined

          // If custom global-not-found.js is defined, use global-not-found.js
          if (matchedGlobalNotFound) {
            const varName = `notFound${nestedCollectedDeclarations.length}`
            nestedCollectedDeclarations.push([varName, matchedGlobalNotFound])
            const layoutName = `layout${nestedCollectedDeclarations.length}`
            nestedCollectedDeclarations.push([layoutName, defaultEmptyStubPath])
            subtreeCode = `{
              children: [${JSON.stringify(UNDERSCORE_NOT_FOUND_ROUTE)}, {
                children: ['${PAGE_SEGMENT_KEY}', {}, {
                  layout: [
                    ${varName},
                    ${JSON.stringify(matchedGlobalNotFound)}
                  ],
                  page: [
                    ${layoutName},
                    ${JSON.stringify(defaultEmptyStubPath)}
                  ]
                }]
              }, {}]
            }`
          } else {
            // If custom not-found.js is found, use it and layout to compose the page,
            // and fallback to built-in not-found component if doesn't exist.
            const notFoundPath =
              definedFilePaths.find(([type]) => type === 'not-found')?.[1] ??
              defaultNotFoundPath
            const varName = `notFound${nestedCollectedDeclarations.length}`
            nestedCollectedDeclarations.push([varName, notFoundPath])
            subtreeCode = `{
              children: [${JSON.stringify(UNDERSCORE_NOT_FOUND_ROUTE.slice(1))}, {
                children: ['${PAGE_SEGMENT_KEY}', {}, {
                  page: [
                    ${varName},
                    ${JSON.stringify(notFoundPath)}
                  ]
                }]
              }, {}]
            }`
          }
        }
      }

      // If it's app-error route, set app-error as children page
      if (isAppErrorRoute) {
        const varName = `appError${nestedCollectedDeclarations.length}`
        nestedCollectedDeclarations.push([varName, appErrorPath])
        subtreeCode = `{
          children: [${JSON.stringify(UNDERSCORE_GLOBAL_ERROR_ROUTE.slice(1))}, {
            children: ['${PAGE_SEGMENT_KEY}', {}, {
              page: [
                ${varName},
                ${JSON.stringify(appErrorPath)}
              ]
            }]
          }, {}]
        }`
      }

      // For 404 route
      // if global-not-found is in definedFilePaths, remove root layout for /_not-found,
      // and change it to global-not-found route.
      // TODO: remove this once global-not-found is stable.
      if (isNotFoundRoute && isGlobalNotFoundEnabled) {
        definedFilePaths = definedFilePaths.filter(
          ([type]) => type !== 'layout'
        )

        // Replace the layout to global-not-found
        definedFilePaths.push([
          'layout',
          definedFilePaths.find(
            ([type]) => type === GLOBAL_NOT_FOUND_FILE_TYPE
          )?.[1] ?? defaultGlobalNotFoundPath,
        ])
      }

      if (isAppErrorRoute) {
        definedFilePaths = definedFilePaths.filter(
          ([type]) => type !== 'layout'
        )
      }

      const modulesCode = `{
        ${definedFilePaths
          .map(([file, filePath]) => {
            const varName = `module${nestedCollectedDeclarations.length}`
            nestedCollectedDeclarations.push([varName, filePath])
            return `'${file}': [${varName}, ${JSON.stringify(filePath)}],`
          })
          .join('\n')}
        ${createMetadataExportsCode(metadata)}
      }`

      if (!subtreeCode) {
        const { treeCode: pageSubtreeCode } =
          await createSubtreePropsFromSegmentPath(
            subSegmentPath,
            nestedCollectedDeclarations
          )

        subtreeCode = pageSubtreeCode
      }

      props[normalizedParallelKey] = `[
        '${parallelSegmentKey}',
        ${subtreeCode},
        ${modulesCode}
      ]`
    }

    const adjacentParallelSegments =
      await resolveAdjacentParallelSegments(segmentPath)

    for (const adjacentParallelSegment of adjacentParallelSegments) {
      if (!props[normalizeParallelKey(adjacentParallelSegment)]) {
        const actualSegment =
          adjacentParallelSegment === 'children'
            ? ''
            : `/${adjacentParallelSegment}`

        // Use the default path if it's found, otherwise if it's a children
        // slot, then use the fallback (which triggers a `notFound()`). If this
        // isn't a children slot, then throw an error, as it produces a silent
        // 404 if we'd used the fallback.
        const fullSegmentPath = `${appDirPrefix}${segmentPath}${actualSegment}`
        let defaultPath = await resolver(`${fullSegmentPath}/default`)
        if (!defaultPath) {
          if (adjacentParallelSegment === 'children') {
            defaultPath = PARALLEL_ROUTE_DEFAULT_PATH
          } else {
            // Check if we're inside a catch-all route (i.e., the parallel route is a child
            // of a catch-all segment). Only skip validation if the slot is UNDER a catch-all.
            // For example:
            //   /[...catchAll]/@slot - isInsideCatchAll = true (skip validation) ✓
            //   /@slot/[...catchAll] - isInsideCatchAll = false (require default) ✓
            // The catch-all provides fallback behavior, so default.js is not required.
            const isInsideCatchAll = segments.some(isCatchAllSegment)

            // Check if this is a leaf segment (no child routes).
            // Leaf segments don't need default.js because there are no child routes
            // that could cause the parallel slot to unmatch. For example:
            //   /repo-overview/@slot/page with no child routes - isLeafSegment = true (skip validation) ✓
            //   /repo-overview/@slot/page with /repo-overview/child/page - isLeafSegment = false (require default) ✓
            // This also handles route groups correctly by filtering them out.
            const isLeafSegment = !hasChildRoutesForSegment(segmentPath)

            if (!isInsideCatchAll && !isLeafSegment) {
              // Replace internal webpack alias with user-facing directory name
              const userFacingPath = fullSegmentPath.replace(
                APP_DIR_ALIAS,
                'app'
              )
              throw new MissingDefaultParallelRouteError(
                userFacingPath,
                adjacentParallelSegment
              )
            }
            defaultPath = PARALLEL_ROUTE_DEFAULT_PATH
          }
        }

        const varName = `default${nestedCollectedDeclarations.length}`
        nestedCollectedDeclarations.push([varName, defaultPath])
        props[normalizeParallelKey(adjacentParallelSegment)] = `[
          '${DEFAULT_SEGMENT_KEY}',
          {},
          {
            defaultPage: [${varName}, ${JSON.stringify(defaultPath)}],
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

  const { treeCode } = await createSubtreePropsFromSegmentPath(
    [],
    collectedDeclarations
  )

  return {
    treeCode: `${treeCode}.children;`,
    rootLayout,
    globalError,
    globalNotFound,
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

const filesInDirMapMap: WeakMap<
  Compilation,
  Map<string, Promise<Set<string>>>
> = new WeakMap()
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

  const isGlobalNotFoundEnabled = !!loaderOptions.isGlobalNotFoundEnabled

  // Update FILE_TYPES on the very top-level of the loader
  if (!isGlobalNotFoundEnabled) {
    // @ts-expect-error this delete is only necessary while experimental
    delete FILE_TYPES['global-not-found']
  }

  const buildInfo = getModuleBuildInfo((this as any)._module)
  const collectedDeclarations: [string, string][] = []
  const page = name.replace(/^app/, '')
  const middlewareConfig: ProxyConfig = JSON.parse(
    Buffer.from(middlewareConfigBase64, 'base64').toString()
  )
  buildInfo.route = {
    page,
    absolutePagePath: createAbsolutePath(appDir, pagePath),
    preferredRegion,
    middlewareConfig,
    relatedModules: [],
  }

  const extensions =
    typeof pageExtensions === 'string'
      ? [pageExtensions]
      : pageExtensions.map((extension) => `.${extension}`)

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
            // We found a parallel route at this level. We don't want to mark it explicitly as the page segment,
            // as that should be matched to the `children` slot. Instead, we use an array, to signal to `createSubtreePropsFromSegmentPath`
            // that it needs to recursively fill in the loader tree code for the parallel route at the appropriate levels.
            matched[rest[0]] = [PAGE_SEGMENT]
            continue
          }
          // If it was a parallel route but we weren't able to find the page segment (ie, maybe the page is nested further)
          // we first insert a special marker to ensure that we still process layout/default/etc at the slot level prior to continuing
          // on to the page segment.
          matched[rest[0]] = [PARALLEL_VIRTUAL_SEGMENT, ...rest.slice(1)]
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

  const hasChildRoutesForSegment = (segmentPath: string): boolean => {
    const pathPrefix = segmentPath ? `${segmentPath}/` : ''

    for (const appPath of normalizedAppPaths) {
      if (appPath.startsWith(pathPrefix)) {
        const rest = appPath.slice(pathPrefix.length).split('/')

        // Filter out route groups to get the actual route segments
        // Route groups (e.g., "(group)") don't contribute to the URL path
        const routeSegments = rest.filter((segment) => !isGroupSegment(segment))

        // If it's just 'page' at this level, skip (not a child route)
        if (routeSegments.length === 1 && routeSegments[0] === 'page') {
          continue
        }

        // If the first segment (after filtering route groups) is a parallel route, skip
        if (routeSegments[0]?.startsWith('@')) {
          continue
        }

        // If we have more than just 'page', then there are child routes
        // Examples:
        //   ['child', 'page'] -> true (has child route)
        //   ['page'] -> false (already filtered above)
        //   ['grandchild', 'deeper', 'page'] -> true (has nested child routes)
        if (
          routeSegments.length > 1 ||
          (routeSegments.length === 1 && routeSegments[0] !== 'page')
        ) {
          return true
        }
      }
    }

    return false
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
  const fileExistsInDirectory = async (dirname: string, fileName: string) => {
    // I don't think we should ever hit this code path, but if we do we should handle it gracefully.
    if (this._compilation === undefined) {
      try {
        return (await getFilesInDir(dirname).catch(() => new Set())).has(
          fileName
        )
      } catch (e) {
        return false
      }
    }
    const map =
      filesInDirMapMap.get(this._compilation) ||
      new Map<string, Promise<Set<string>>>()
    if (!filesInDirMapMap.has(this._compilation)) {
      filesInDirMapMap.set(this._compilation, map)
    }
    if (!map.has(dirname)) {
      map.set(
        dirname,
        getFilesInDir(dirname).catch(() => new Set())
      )
    }
    return ((await map.get(dirname)) || new Set()).has(fileName)
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
      appDir,
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
    hasChildRoutesForSegment,
    loaderContext: this,
    pageExtensions,
    basePath,
    collectedDeclarations,
    isGlobalNotFoundEnabled,
  })

  const isGlobalNotFoundPath =
    page === UNDERSCORE_NOT_FOUND_ROUTE_ENTRY &&
    !!treeCodeResult.globalNotFound &&
    isGlobalNotFoundEnabled

  const isAppErrorRoute = page === UNDERSCORE_GLOBAL_ERROR_ROUTE_ENTRY

  if (!treeCodeResult.rootLayout && !isGlobalNotFoundPath && !isAppErrorRoute) {
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
        tsconfigPath: tsconfigPath,
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
      if (this._compilation) filesInDirMapMap.get(this._compilation)?.clear()
      treeCodeResult = await createTreeCodeFromPath(pagePath, {
        page,
        resolveDir,
        resolver,
        metadataResolver,
        resolveParallelSegments,
        hasChildRoutesForSegment,
        loaderContext: this,
        pageExtensions,
        basePath,
        collectedDeclarations,
        isGlobalNotFoundEnabled,
      })
    }
  }

  const pathname = new AppPathnameNormalizer().normalize(page)

  // Prefer to modify next/src/server/app-render/entry-base.ts since this is shared with Turbopack.
  // Any changes to this code should be reflected in Turbopack's app_source.rs and/or app-renderer.tsx as well.
  const code = await loadEntrypoint(
    'app-page',
    {
      VAR_DEFINITION_PAGE: page,
      VAR_DEFINITION_PATHNAME: pathname,
      VAR_MODULE_GLOBAL_ERROR: treeCodeResult.globalError,
    },
    {
      tree: treeCodeResult.treeCode,
      __next_app_require__: '__webpack_require__',
      // all modules are in the entry chunk, so we never actually need to load chunks in webpack
      __next_app_load_chunk__: '() => Promise.resolve()',
    }
  )

  // Lazily evaluate the imported modules in the generated code
  const header = collectedDeclarations
    .map(([varName, modulePath]) => {
      return `const ${varName} = () => import(/* webpackMode: "eager" */ ${JSON.stringify(
        modulePath
      )});\n`
    })
    .join('')

  return header + code
}

export default nextAppLoader
