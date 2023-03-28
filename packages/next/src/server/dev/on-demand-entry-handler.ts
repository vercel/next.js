import type ws from 'ws'
import origDebug from 'next/dist/compiled/debug'
import type { webpack } from 'next/dist/compiled/webpack/webpack'
import type { NextConfigComplete } from '../config-shared'
import type {
  DynamicParamTypesShort,
  FlightRouterState,
} from '../app-render/types'

import { EventEmitter } from 'events'
import { findPageFile } from '../lib/find-page-file'
import { runDependingOnPageType } from '../../build/entries'
import { join, posix } from 'path'
import { normalizePathSep } from '../../shared/lib/page-path/normalize-path-sep'
import { normalizePagePath } from '../../shared/lib/page-path/normalize-page-path'
import { ensureLeadingSlash } from '../../shared/lib/page-path/ensure-leading-slash'
import { removePagePathTail } from '../../shared/lib/page-path/remove-page-path-tail'
import { reportTrigger } from '../../build/output'
import getRouteFromEntrypoint from '../get-route-from-entrypoint'
import { getPageStaticInfo } from '../../build/analysis/get-page-static-info'
import {
  isInstrumentationHookFile,
  isInstrumentationHookFilename,
  isMiddlewareFile,
  isMiddlewareFilename,
} from '../../build/utils'
import { PageNotFoundError } from '../../shared/lib/utils'
import {
  CompilerNameValues,
  COMPILER_INDEXES,
  COMPILER_NAMES,
  RSC_MODULE_TYPES,
} from '../../shared/lib/constants'
import { RouteMatch } from '../future/route-matches/route-match'
import { RouteKind } from '../future/route-kind'
import { AppPageRouteMatch } from '../future/route-matches/app-page-route-match'

const debug = origDebug('next:on-demand-entry-handler')

/**
 * Returns object keys with type inferred from the object key
 */
const keys = Object.keys as <T>(o: T) => Extract<keyof T, string>[]

const COMPILER_KEYS = keys(COMPILER_INDEXES)

function treePathToEntrypoint(
  segmentPath: string[],
  parentPath?: string
): string {
  const [parallelRouteKey, segment] = segmentPath

  // TODO-APP: modify this path to cover parallelRouteKey convention
  const path =
    (parentPath ? parentPath + '/' : '') +
    (parallelRouteKey !== 'children' && !segment.startsWith('@')
      ? `@${parallelRouteKey}/`
      : '') +
    (segment === '' ? 'page' : segment)

  // Last segment
  if (segmentPath.length === 2) {
    return path
  }

  const childSegmentPath = segmentPath.slice(2)
  return treePathToEntrypoint(childSegmentPath, path)
}

function convertDynamicParamTypeToSyntax(
  dynamicParamTypeShort: DynamicParamTypesShort,
  param: string
) {
  switch (dynamicParamTypeShort) {
    case 'c':
      return `[...${param}]`
    case 'oc':
      return `[[...${param}]]`
    case 'd':
      return `[${param}]`
    default:
      throw new Error('Unknown dynamic param type')
  }
}

/**
 * format: {compiler type}@{page type}@{page path}
 * e.g. client@pages@/index
 * e.g. server@app@app/page
 *
 * This guarantees the uniqueness for each page, to avoid conflicts between app/ and pages/
 */

export function getEntryKey(
  compilerType: CompilerNameValues,
  pageBundleType: 'app' | 'pages' | 'root',
  page: string
) {
  return `${compilerType}@${pageBundleType}@${page}`
}

function getPageBundleType(pageBundlePath: string) {
  // Handle special case for /_error
  if (pageBundlePath === '/_error') return 'pages'
  if (isMiddlewareFilename(pageBundlePath)) return 'root'
  return pageBundlePath.startsWith('pages/')
    ? 'pages'
    : pageBundlePath.startsWith('app/')
    ? 'app'
    : 'root'
}

function getEntrypointsFromTree(
  tree: FlightRouterState,
  isFirst: boolean,
  parentPath: string[] = []
) {
  const [segment, parallelRoutes] = tree

  const currentSegment = Array.isArray(segment)
    ? convertDynamicParamTypeToSyntax(segment[2], segment[0])
    : segment

  const isPageSegment = currentSegment.startsWith('__PAGE__')

  const currentPath = [...parentPath, isPageSegment ? '' : currentSegment]

  if (!isFirst && isPageSegment) {
    // TODO get rid of '' at the start of tree
    return [treePathToEntrypoint(currentPath.slice(1))]
  }

  return Object.keys(parallelRoutes).reduce(
    (paths: string[], key: string): string[] => {
      const childTree = parallelRoutes[key]
      const childPages = getEntrypointsFromTree(childTree, false, [
        ...currentPath,
        key,
      ])
      return [...paths, ...childPages]
    },
    []
  )
}

export const ADDED = Symbol('added')
export const BUILDING = Symbol('building')
export const BUILT = Symbol('built')

interface EntryType {
  /**
   * Tells if a page is scheduled to be disposed.
   */
  dispose?: boolean
  /**
   * Timestamp with the last time the page was active.
   */
  lastActiveTime?: number
  /**
   * Page build status.
   */
  status?: typeof ADDED | typeof BUILDING | typeof BUILT

  /**
   * Path to the page file relative to the dist folder with no extension.
   * For example: `pages/about/index`
   */
  bundlePath: string

  /**
   * Webpack request to create a dependency for.
   */
  request: string
}

// Shadowing check in ESLint does not account for enum
// eslint-disable-next-line no-shadow
export const enum EntryTypes {
  ENTRY,
  CHILD_ENTRY,
}
interface Entry extends EntryType {
  type: EntryTypes.ENTRY
  /**
   * The absolute page to the page file. Used for detecting if the file was removed. For example:
   * `/Users/Rick/project/pages/about/index.js`
   */
  absolutePagePath: string
  /**
   * All parallel pages that match the same entry, for example:
   * ['/parallel/@bar/nested/@a/page', '/parallel/@bar/nested/@b/page', '/parallel/@foo/nested/@a/page', '/parallel/@foo/nested/@b/page']
   */
  appPaths: ReadonlyArray<string> | null
}

interface ChildEntry extends EntryType {
  type: EntryTypes.CHILD_ENTRY
  /**
   * Which parent entries use this childEntry.
   */
  parentEntries: Set<string>
  /**
   * The absolute page to the entry file. Used for detecting if the file was removed. For example:
   * `/Users/Rick/project/app/about/layout.js`
   */
  absoluteEntryFilePath?: string
}

const entriesMap: Map<
  string,
  {
    /**
     * The key composed of the compiler name and the page. For example:
     * `edge-server/about`
     */
    [entryName: string]: Entry | ChildEntry
  }
> = new Map()

// remove /server from end of output for server compiler
const normalizeOutputPath = (dir: string) => dir.replace(/[/\\]server$/, '')

export const getEntries = (
  dir: string
): NonNullable<ReturnType<typeof entriesMap['get']>> => {
  dir = normalizeOutputPath(dir)
  const entries = entriesMap.get(dir) || {}
  entriesMap.set(dir, entries)
  return entries
}

const invalidators: Map<string, Invalidator> = new Map()

export const getInvalidator = (dir: string) => {
  dir = normalizeOutputPath(dir)
  return invalidators.get(dir)
}

const doneCallbacks: EventEmitter = new EventEmitter()
const lastClientAccessPages = ['']
const lastServerAccessPagesForAppDir = ['']

type BuildingTracker = Set<CompilerNameValues>
type RebuildTracker = Set<CompilerNameValues>

// Make sure only one invalidation happens at a time
// Otherwise, webpack hash gets changed and it'll force the client to reload.
class Invalidator {
  private multiCompiler: webpack.MultiCompiler

  private building: BuildingTracker = new Set()
  private rebuildAgain: RebuildTracker = new Set()

  constructor(multiCompiler: webpack.MultiCompiler) {
    this.multiCompiler = multiCompiler
  }

  public shouldRebuildAll() {
    return this.rebuildAgain.size > 0
  }

  invalidate(compilerKeys: typeof COMPILER_KEYS = COMPILER_KEYS): void {
    for (const key of compilerKeys) {
      // If there's a current build is processing, we won't abort it by invalidating.
      // (If aborted, it'll cause a client side hard reload)
      // But let it to invalidate just after the completion.
      // So, it can re-build the queued pages at once.

      if (this.building.has(key)) {
        this.rebuildAgain.add(key)
        continue
      }

      this.building.add(key)
      this.multiCompiler.compilers[COMPILER_INDEXES[key]].watching?.invalidate()
    }
  }

  public startBuilding(compilerKey: keyof typeof COMPILER_INDEXES) {
    this.building.add(compilerKey)
  }

  public doneBuilding(compilerKeys: typeof COMPILER_KEYS = []) {
    const rebuild: typeof COMPILER_KEYS = []
    for (const key of compilerKeys) {
      this.building.delete(key)

      if (this.rebuildAgain.has(key)) {
        rebuild.push(key)
        this.rebuildAgain.delete(key)
      }
    }
    this.invalidate(rebuild)
  }

  public willRebuild(compilerKey: keyof typeof COMPILER_INDEXES) {
    return this.rebuildAgain.has(compilerKey)
  }
}

function disposeInactiveEntries(
  entries: NonNullable<ReturnType<typeof entriesMap['get']>>,
  maxInactiveAge: number
) {
  Object.keys(entries).forEach((entryKey) => {
    const entryData = entries[entryKey]
    const { lastActiveTime, status, dispose } = entryData

    // TODO-APP: implement disposing of CHILD_ENTRY
    if (entryData.type === EntryTypes.CHILD_ENTRY) {
      return
    }

    if (dispose)
      // Skip pages already scheduled for disposing
      return

    // This means this entry is currently building or just added
    // We don't need to dispose those entries.
    if (status !== BUILT) return

    // We should not build the last accessed page even we didn't get any pings
    // Sometimes, it's possible our XHR ping to wait before completing other requests.
    // In that case, we should not dispose the current viewing page
    if (
      lastClientAccessPages.includes(entryKey) ||
      lastServerAccessPagesForAppDir.includes(entryKey)
    )
      return

    if (lastActiveTime && Date.now() - lastActiveTime > maxInactiveAge) {
      entries[entryKey].dispose = true
    }
  })
}

// Normalize both app paths and page paths
function tryToNormalizePagePath(page: string) {
  try {
    return normalizePagePath(page)
  } catch (err) {
    console.error(err)
    throw new PageNotFoundError(page)
  }
}

/**
 * Attempts to find a page file path from the given pages absolute directory,
 * a page and allowed extensions. If the page can't be found it will throw an
 * error. It defaults the `/_error` page to Next.js internal error page.
 *
 * @param rootDir Absolute path to the project root.
 * @param pagesDir Absolute path to the pages folder with trailing `/pages`.
 * @param normalizedPagePath The page normalized (it will be denormalized).
 * @param pageExtensions Array of page extensions.
 */
async function findPagePathData(
  rootDir: string,
  page: string,
  extensions: string[],
  pagesDir?: string,
  appDir?: string
) {
  const normalizedPagePath = tryToNormalizePagePath(page)
  let pagePath: string | null = null

  const isInstrumentation = isInstrumentationHookFile(normalizedPagePath)
  if (isMiddlewareFile(normalizedPagePath) || isInstrumentation) {
    pagePath = await findPageFile(
      rootDir,
      normalizedPagePath,
      extensions,
      false
    )

    if (!pagePath) {
      throw new PageNotFoundError(normalizedPagePath)
    }

    const pageUrl = ensureLeadingSlash(
      removePagePathTail(normalizePathSep(pagePath), {
        extensions,
      })
    )

    let bundlePath = normalizedPagePath
    let pageKey = posix.normalize(pageUrl)

    if (isInstrumentation) {
      bundlePath = bundlePath.replace('/src', '')
      pageKey = page.replace('/src', '')
    }

    return {
      absolutePagePath: join(rootDir, pagePath),
      bundlePath: bundlePath.slice(1),
      page: pageKey,
    }
  }

  // Check appDir first falling back to pagesDir
  if (appDir) {
    pagePath = await findPageFile(appDir, normalizedPagePath, extensions, true)
    if (pagePath) {
      const pageUrl = ensureLeadingSlash(
        removePagePathTail(normalizePathSep(pagePath), {
          keepIndex: true,
          extensions,
        })
      )

      return {
        absolutePagePath: join(appDir, pagePath),
        bundlePath: posix.join('app', pageUrl),
        page: posix.normalize(pageUrl),
      }
    }
  }

  if (!pagePath && pagesDir) {
    pagePath = await findPageFile(
      pagesDir,
      normalizedPagePath,
      extensions,
      false
    )
  }

  if (pagePath !== null && pagesDir) {
    const pageUrl = ensureLeadingSlash(
      removePagePathTail(normalizePathSep(pagePath), {
        extensions,
      })
    )

    return {
      absolutePagePath: join(pagesDir, pagePath),
      bundlePath: posix.join('pages', normalizePagePath(pageUrl)),
      page: posix.normalize(pageUrl),
    }
  }

  if (page === '/_error') {
    return {
      absolutePagePath: require.resolve('next/dist/pages/_error'),
      bundlePath: page,
      page: normalizePathSep(page),
    }
  } else {
    throw new PageNotFoundError(normalizedPagePath)
  }
}

async function findRoutePathData(
  rootDir: string,
  page: string,
  extensions: string[],
  pagesDir?: string,
  appDir?: string,
  match?: RouteMatch
): ReturnType<typeof findPagePathData> {
  if (match) {
    // If the match is available, we don't have to discover the data from the
    // filesystem.
    return {
      absolutePagePath: match.definition.filename,
      page: match.definition.page,
      bundlePath: match.definition.bundlePath,
    }
  }

  return findPagePathData(rootDir, page, extensions, pagesDir, appDir)
}

export function onDemandEntryHandler({
  maxInactiveAge,
  multiCompiler,
  nextConfig,
  pagesBufferLength,
  pagesDir,
  rootDir,
  appDir,
}: {
  maxInactiveAge: number
  multiCompiler: webpack.MultiCompiler
  nextConfig: NextConfigComplete
  pagesBufferLength: number
  pagesDir?: string
  rootDir: string
  appDir?: string
}) {
  let curInvalidator: Invalidator = getInvalidator(
    multiCompiler.outputPath
  ) as any
  let curEntries = getEntries(multiCompiler.outputPath) as any

  if (!curInvalidator) {
    curInvalidator = new Invalidator(multiCompiler)
    invalidators.set(multiCompiler.outputPath, curInvalidator)
  }

  const startBuilding = (compilation: webpack.Compilation) => {
    const compilationName = compilation.name as any as CompilerNameValues
    curInvalidator.startBuilding(compilationName)
  }
  for (const compiler of multiCompiler.compilers) {
    compiler.hooks.make.tap('NextJsOnDemandEntries', startBuilding)
  }

  function getPagePathsFromEntrypoints(
    type: CompilerNameValues,
    entrypoints: Map<string, { name?: string }>,
    root?: boolean
  ) {
    const pagePaths: string[] = []
    for (const entrypoint of entrypoints.values()) {
      const page = getRouteFromEntrypoint(entrypoint.name!, root)

      if (page) {
        const pageBundleType = entrypoint.name?.startsWith('app/')
          ? 'app'
          : 'pages'
        pagePaths.push(getEntryKey(type, pageBundleType, page))
      } else if (
        (root && entrypoint.name === 'root') ||
        isMiddlewareFilename(entrypoint.name) ||
        isInstrumentationHookFilename(entrypoint.name)
      ) {
        pagePaths.push(getEntryKey(type, 'root', `/${entrypoint.name}`))
      }
    }
    return pagePaths
  }

  for (const compiler of multiCompiler.compilers) {
    compiler.hooks.done.tap('NextJsOnDemandEntries', () =>
      getInvalidator(compiler.outputPath)?.doneBuilding([
        compiler.name as keyof typeof COMPILER_INDEXES,
      ])
    )
  }

  multiCompiler.hooks.done.tap('NextJsOnDemandEntries', (multiStats) => {
    const [clientStats, serverStats, edgeServerStats] = multiStats.stats
    const root = !!appDir
    const entryNames = [
      ...getPagePathsFromEntrypoints(
        COMPILER_NAMES.client,
        clientStats.compilation.entrypoints,
        root
      ),
      ...getPagePathsFromEntrypoints(
        COMPILER_NAMES.server,
        serverStats.compilation.entrypoints,
        root
      ),
      ...(edgeServerStats
        ? getPagePathsFromEntrypoints(
            COMPILER_NAMES.edgeServer,
            edgeServerStats.compilation.entrypoints,
            root
          )
        : []),
    ]

    for (const name of entryNames) {
      const entry = curEntries[name]
      if (!entry) {
        continue
      }

      if (entry.status !== BUILDING) {
        continue
      }

      entry.status = BUILT
      doneCallbacks.emit(name)
    }

    getInvalidator(multiCompiler.outputPath)?.doneBuilding([...COMPILER_KEYS])
  })

  const pingIntervalTime = Math.max(1000, Math.min(5000, maxInactiveAge))

  setInterval(function () {
    disposeInactiveEntries(curEntries, maxInactiveAge)
  }, pingIntervalTime + 1000).unref()

  function handleAppDirPing(
    tree: FlightRouterState
  ): { success: true } | { invalid: true } {
    const pages = getEntrypointsFromTree(tree, true)
    let toSend: { invalid: true } | { success: true } = { invalid: true }

    for (const page of pages) {
      for (const compilerType of [
        COMPILER_NAMES.client,
        COMPILER_NAMES.server,
        COMPILER_NAMES.edgeServer,
      ]) {
        const entryKey = getEntryKey(compilerType, 'app', `/${page}`)
        const entryInfo = curEntries[entryKey]

        // If there's no entry, it may have been invalidated and needs to be re-built.
        if (!entryInfo) {
          // if (page !== lastEntry) client pings, but there's no entry for page
          continue
        }

        // We don't need to maintain active state of anything other than BUILT entries
        if (entryInfo.status !== BUILT) continue

        // If there's an entryInfo
        if (!lastServerAccessPagesForAppDir.includes(entryKey)) {
          lastServerAccessPagesForAppDir.unshift(entryKey)

          // Maintain the buffer max length
          // TODO: verify that the current pageKey is not at the end of the array as multiple entrypoints can exist
          if (lastServerAccessPagesForAppDir.length > pagesBufferLength) {
            lastServerAccessPagesForAppDir.pop()
          }
        }
        entryInfo.lastActiveTime = Date.now()
        entryInfo.dispose = false
        toSend = { success: true }
      }
    }

    return toSend
  }

  function handlePing(pg: string) {
    const page = normalizePathSep(pg)
    let toSend: { invalid: true } | { success: true } = { invalid: true }

    for (const compilerType of [
      COMPILER_NAMES.client,
      COMPILER_NAMES.server,
      COMPILER_NAMES.edgeServer,
    ]) {
      const entryKey = getEntryKey(compilerType, 'pages', page)
      const entryInfo = curEntries[entryKey]

      // If there's no entry, it may have been invalidated and needs to be re-built.
      if (!entryInfo) {
        // if (page !== lastEntry) client pings, but there's no entry for page
        if (compilerType === COMPILER_NAMES.client) {
          return { invalid: true }
        }
        continue
      }

      // 404 is an on demand entry but when a new page is added we have to refresh the page
      toSend = page === '/_error' ? { invalid: true } : { success: true }

      // We don't need to maintain active state of anything other than BUILT entries
      if (entryInfo.status !== BUILT) continue

      // If there's an entryInfo
      if (!lastClientAccessPages.includes(entryKey)) {
        lastClientAccessPages.unshift(entryKey)

        // Maintain the buffer max length
        if (lastClientAccessPages.length > pagesBufferLength) {
          lastClientAccessPages.pop()
        }
      }
      entryInfo.lastActiveTime = Date.now()
      entryInfo.dispose = false
    }
    return toSend
  }

  return {
    async ensurePage({
      page,
      clientOnly,
      appPaths = null,
      match,
    }: {
      page: string
      clientOnly: boolean
      appPaths?: ReadonlyArray<string> | null
      match?: RouteMatch
    }): Promise<void> {
      const stalledTime = 60
      const stalledEnsureTimeout = setTimeout(() => {
        debug(
          `Ensuring ${page} has taken longer than ${stalledTime}s, if this continues to stall this may be a bug`
        )
      }, stalledTime * 1000)

      // If the route is actually an app page route, then we should have access
      // to the app route match, and therefore, the appPaths from it.
      if (match?.definition.kind === RouteKind.APP_PAGE) {
        const { definition: route } = match as AppPageRouteMatch
        appPaths = route.appPaths
      }

      try {
        const pagePathData = await findRoutePathData(
          rootDir,
          page,
          nextConfig.pageExtensions,
          pagesDir,
          appDir,
          match
        )

        const isInsideAppDir =
          !!appDir && pagePathData.absolutePagePath.startsWith(appDir)

        const pageType = isInsideAppDir ? 'app' : 'pages'
        const pageBundleType = getPageBundleType(pagePathData.bundlePath)
        const addEntry = (
          compilerType: CompilerNameValues
        ): {
          entryKey: string
          newEntry: boolean
          shouldInvalidate: boolean
        } => {
          const entryKey = getEntryKey(
            compilerType,
            pageBundleType,
            pagePathData.page
          )
          if (
            curEntries[entryKey] &&
            // there can be an overlap in the entryKey for the instrumentation hook file and a page named the same
            // this is a quick fix to support this scenario by overwriting the instrumentation hook entry, since we only use it one time
            // any changes to the instrumentation hook file will require a restart of the dev server anyway
            !isInstrumentationHookFilename(curEntries[entryKey].bundlePath)
          ) {
            curEntries[entryKey].dispose = false
            curEntries[entryKey].lastActiveTime = Date.now()
            if (curEntries[entryKey].status === BUILT) {
              return {
                entryKey,
                newEntry: false,
                shouldInvalidate: false,
              }
            }

            return {
              entryKey,
              newEntry: false,
              shouldInvalidate: true,
            }
          }

          curEntries[entryKey] = {
            type: EntryTypes.ENTRY,
            appPaths,
            absolutePagePath: pagePathData.absolutePagePath,
            request: pagePathData.absolutePagePath,
            bundlePath: pagePathData.bundlePath,
            dispose: false,
            lastActiveTime: Date.now(),
            status: ADDED,
          }
          return {
            entryKey: entryKey,
            newEntry: true,
            shouldInvalidate: true,
          }
        }

        const staticInfo = await getPageStaticInfo({
          pageFilePath: pagePathData.absolutePagePath,
          nextConfig,
          isDev: true,
          pageType,
        })

        const added = new Map<CompilerNameValues, ReturnType<typeof addEntry>>()
        const isServerComponent =
          isInsideAppDir && staticInfo.rsc !== RSC_MODULE_TYPES.client

        await runDependingOnPageType({
          page: pagePathData.page,
          pageRuntime: staticInfo.runtime,
          pageType: pageBundleType,
          onClient: () => {
            // Skip adding the client entry for app / Server Components.
            if (isServerComponent || isInsideAppDir) {
              return
            }
            added.set(COMPILER_NAMES.client, addEntry(COMPILER_NAMES.client))
          },
          onServer: () => {
            added.set(COMPILER_NAMES.server, addEntry(COMPILER_NAMES.server))
            const edgeServerEntry = getEntryKey(
              COMPILER_NAMES.edgeServer,
              pageBundleType,
              pagePathData.page
            )
            if (
              curEntries[edgeServerEntry] &&
              !isInstrumentationHookFile(pagePathData.page)
            ) {
              // Runtime switched from edge to server
              delete curEntries[edgeServerEntry]
            }
          },
          onEdgeServer: () => {
            added.set(
              COMPILER_NAMES.edgeServer,
              addEntry(COMPILER_NAMES.edgeServer)
            )
            const serverEntry = getEntryKey(
              COMPILER_NAMES.server,
              pageBundleType,
              pagePathData.page
            )
            if (
              curEntries[serverEntry] &&
              !isInstrumentationHookFile(pagePathData.page)
            ) {
              // Runtime switched from server to edge
              delete curEntries[serverEntry]
            }
          },
        })

        const addedValues = [...added.values()]
        const entriesThatShouldBeInvalidated = [...added.entries()].filter(
          ([, entry]) => entry.shouldInvalidate
        )
        const hasNewEntry = addedValues.some((entry) => entry.newEntry)

        if (hasNewEntry) {
          reportTrigger(
            !clientOnly && hasNewEntry
              ? `${pagePathData.page} (client and server)`
              : pagePathData.page
          )
        }

        if (entriesThatShouldBeInvalidated.length > 0) {
          const invalidatePromise = Promise.all(
            entriesThatShouldBeInvalidated.map(
              ([compilerKey, { entryKey }]) => {
                return new Promise<void>((resolve, reject) => {
                  doneCallbacks.once(entryKey, (err: Error) => {
                    if (err) {
                      return reject(err)
                    }

                    // If the invalidation also triggers a rebuild, we need to
                    // wait for that additional build to prevent race conditions.
                    const needsRebuild = curInvalidator.willRebuild(compilerKey)
                    if (needsRebuild) {
                      doneCallbacks.once(entryKey, (rebuildErr: Error) => {
                        if (rebuildErr) {
                          return reject(rebuildErr)
                        }
                        resolve()
                      })
                    } else {
                      resolve()
                    }
                  })
                })
              }
            )
          )

          curInvalidator.invalidate([...added.keys()])
          await invalidatePromise
        }
      } finally {
        clearTimeout(stalledEnsureTimeout)
      }
    },

    onHMR(client: ws) {
      client.addEventListener('message', ({ data }) => {
        try {
          const parsedData = JSON.parse(
            typeof data !== 'string' ? data.toString() : data
          )

          if (parsedData.event === 'ping') {
            const result = parsedData.appDirRoute
              ? handleAppDirPing(parsedData.tree)
              : handlePing(parsedData.page)
            client.send(
              JSON.stringify({
                ...result,
                [parsedData.appDirRoute ? 'action' : 'event']: 'pong',
              })
            )
          }
        } catch (_) {}
      })
    },
  }
}
