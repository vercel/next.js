import type ws from 'ws'
import type { webpack5 as webpack } from 'next/dist/compiled/webpack/webpack'
import type { NextConfigComplete } from '../config-shared'
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
import { serverComponentRegex } from '../../build/webpack/loaders/utils'
import { getPageStaticInfo } from '../../build/analysis/get-page-static-info'
import { isMiddlewareFile, isMiddlewareFilename } from '../../build/utils'
import { PageNotFoundError } from '../../shared/lib/utils'
import { DynamicParamTypesShort, FlightRouterState } from '../app-render'

function treePathToEntrypoint(
  segmentPath: string[],
  parentPath?: string
): string {
  const [parallelRouteKey, segment] = segmentPath

  // TODO: modify this path to cover parallelRouteKey convention
  const path =
    (parentPath ? parentPath + '/' : '') +
    (parallelRouteKey !== 'children' ? parallelRouteKey + '/' : '') +
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

function getEntrypointsFromTree(
  tree: FlightRouterState,
  isFirst: boolean,
  parentPath: string[] = []
) {
  const [segment, parallelRoutes] = tree

  const currentSegment = Array.isArray(segment)
    ? convertDynamicParamTypeToSyntax(segment[2], segment[0])
    : segment

  const currentPath = [...parentPath, currentSegment]

  if (!isFirst && currentSegment === '') {
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

export const entries: {
  /**
   * The key composed of the compiler name and the page. For example:
   * `edge-server/about`
   */
  [page: string]: {
    /**
     * The absolute page to the page file. For example:
     * `/Users/Rick/project/pages/about/index.js`
     */
    absolutePagePath: string
    /**
     * Path to the page file relative to the dist folder with no extension.
     * For example: `pages/about/index`
     */
    bundlePath: string
    /**
     * Client entry loader and query parameters when RSC is enabled.
     */
    clientLoader?: string
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
  }
} = {}

let invalidator: Invalidator
export const getInvalidator = () => invalidator

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
  pagesDir: string
  rootDir: string
  appDir?: string
}) {
  invalidator = new Invalidator(multiCompiler)
  const doneCallbacks: EventEmitter | null = new EventEmitter()
  const lastClientAccessPages = ['']
  const lastServerAccessPagesForAppDir = ['']

  const startBuilding = (_compilation: webpack.Compilation) => {
    invalidator.startBuilding()
  }
  for (const compiler of multiCompiler.compilers) {
    compiler.hooks.make.tap('NextJsOnDemandEntries', startBuilding)
  }

  function getPagePathsFromEntrypoints(
    type: 'client' | 'server' | 'edge-server',
    entrypoints: Map<string, { name?: string }>,
    root?: boolean
  ) {
    const pagePaths: string[] = []
    for (const entrypoint of entrypoints.values()) {
      const page = getRouteFromEntrypoint(entrypoint.name!, root)
      if (page) {
        pagePaths.push(`${type}${page}`)
      } else if (
        (root && entrypoint.name === 'root') ||
        isMiddlewareFilename(entrypoint.name)
      ) {
        pagePaths.push(`${type}/${entrypoint.name}`)
      }
    }

    return pagePaths
  }

  multiCompiler.hooks.done.tap('NextJsOnDemandEntries', (multiStats) => {
    if (invalidator.rebuildAgain) {
      return invalidator.doneBuilding()
    }
    const [clientStats, serverStats, edgeServerStats] = multiStats.stats
    const root = !!appDir
    const pagePaths = [
      ...getPagePathsFromEntrypoints(
        'client',
        clientStats.compilation.entrypoints,
        root
      ),
      ...getPagePathsFromEntrypoints(
        'server',
        serverStats.compilation.entrypoints,
        root
      ),
      ...(edgeServerStats
        ? getPagePathsFromEntrypoints(
            'edge-server',
            edgeServerStats.compilation.entrypoints,
            root
          )
        : []),
    ]

    for (const page of pagePaths) {
      const entry = entries[page]
      if (!entry) {
        continue
      }

      if (entry.status !== BUILDING) {
        continue
      }

      entry.status = BUILT
      doneCallbacks!.emit(page)
    }

    invalidator.doneBuilding()
  })

  const pingIntervalTime = Math.max(1000, Math.min(5000, maxInactiveAge))

  setInterval(function () {
    disposeInactiveEntries(
      lastClientAccessPages,
      lastServerAccessPagesForAppDir,
      maxInactiveAge
    )
  }, pingIntervalTime + 1000).unref()

  function handleAppDirPing(
    tree: FlightRouterState
  ): { success: true } | { invalid: true } {
    const pages = getEntrypointsFromTree(tree, true)

    for (const page of pages) {
      const pageKey = `server/${page}`
      const entryInfo = entries[pageKey]

      // If there's no entry, it may have been invalidated and needs to be re-built.
      if (!entryInfo) {
        // if (page !== lastEntry) client pings, but there's no entry for page
        return { invalid: true }
      }

      // We don't need to maintain active state of anything other than BUILT entries
      if (entryInfo.status !== BUILT) continue

      // If there's an entryInfo
      if (!lastServerAccessPagesForAppDir.includes(pageKey)) {
        lastServerAccessPagesForAppDir.unshift(pageKey)

        // Maintain the buffer max length
        // TODO: verify that the current pageKey is not at the end of the array as multiple entrypoints can exist
        if (lastServerAccessPagesForAppDir.length > pagesBufferLength) {
          lastServerAccessPagesForAppDir.pop()
        }
      }
      entryInfo.lastActiveTime = Date.now()
      entryInfo.dispose = false
    }

    return { success: true }
  }

  function handlePing(pg: string) {
    const page = normalizePathSep(pg)
    const pageKey = `client${page}`
    const entryInfo = entries[pageKey]

    // If there's no entry, it may have been invalidated and needs to be re-built.
    if (!entryInfo) {
      // if (page !== lastEntry) client pings, but there's no entry for page
      return { invalid: true }
    }

    // 404 is an on demand entry but when a new page is added we have to refresh the page
    const toSend = page === '/_error' ? { invalid: true } : { success: true }

    // We don't need to maintain active state of anything other than BUILT entries
    if (entryInfo.status !== BUILT) return

    // If there's an entryInfo
    if (!lastClientAccessPages.includes(pageKey)) {
      lastClientAccessPages.unshift(pageKey)

      // Maintain the buffer max length
      if (lastClientAccessPages.length > pagesBufferLength) {
        lastClientAccessPages.pop()
      }
    }
    entryInfo.lastActiveTime = Date.now()
    entryInfo.dispose = false
    return toSend
  }

  return {
    async ensurePage(page: string, clientOnly: boolean) {
      const pagePathData = await findPagePathData(
        rootDir,
        pagesDir,
        page,
        nextConfig.pageExtensions,
        appDir
      )

      let entryAdded = false

      const addPageEntry = (type: 'client' | 'server' | 'edge-server') => {
        return new Promise<void>((resolve, reject) => {
          const isServerComponent = serverComponentRegex.test(
            pagePathData.absolutePagePath
          )
          const isInsideAppDir =
            appDir && pagePathData.absolutePagePath.startsWith(appDir)

          const pageKey = `${type}${pagePathData.page}`

          if (entries[pageKey]) {
            entries[pageKey].dispose = false
            entries[pageKey].lastActiveTime = Date.now()
            if (entries[pageKey].status === BUILT) {
              resolve()
              return
            }
          } else {
            if (type === 'client' && (isServerComponent || isInsideAppDir)) {
              // Skip adding the client entry here.
            } else {
              entryAdded = true
              entries[pageKey] = {
                absolutePagePath: pagePathData.absolutePagePath,
                bundlePath: pagePathData.bundlePath,
                dispose: false,
                lastActiveTime: Date.now(),
                status: ADDED,
              }
            }
          }

          doneCallbacks!.once(pageKey, (err: Error) => {
            if (err) return reject(err)
            resolve()
          })
        })
      }

      const staticInfo = await getPageStaticInfo({
        pageFilePath: pagePathData.absolutePagePath,
        nextConfig,
      })

      const result = runDependingOnPageType({
        page: pagePathData.page,
        pageRuntime: staticInfo.runtime,
        onClient: () => addPageEntry('client'),
        onServer: () => addPageEntry('server'),
        onEdgeServer: () => addPageEntry('edge-server'),
      })

      const promises = Object.values(result)
      if (entryAdded) {
        reportTrigger(
          !clientOnly && promises.length > 1
            ? `${pagePathData.page} (client and server)`
            : pagePathData.page
        )
        invalidator.invalidate(Object.keys(result))
      }

      return Promise.all(promises)
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

function disposeInactiveEntries(
  lastClientAccessPages: string[],
  lastServerAccessPagesForAppDir: string[],
  maxInactiveAge: number
) {
  Object.keys(entries).forEach((page) => {
    const { lastActiveTime, status, dispose, bundlePath } = entries[page]

    const isClientComponentsEntry =
      bundlePath.startsWith('app/') && page.startsWith('client/')

    // Disposing client component entry is handled when disposing server component entry
    if (isClientComponentsEntry) return

    // Skip pages already scheduled for disposing
    if (dispose) return

    // This means this entry is currently building or just added
    // We don't need to dispose those entries.
    if (status !== BUILT) return

    // We should not build the last accessed page even we didn't get any pings
    // Sometimes, it's possible our XHR ping to wait before completing other requests.
    // In that case, we should not dispose the current viewing page
    if (
      lastClientAccessPages.includes(page) ||
      lastServerAccessPagesForAppDir.includes(page)
    )
      return

    if (lastActiveTime && Date.now() - lastActiveTime > maxInactiveAge) {
      const isServerComponentsEntry =
        bundlePath.startsWith('app/') && page.startsWith('server/')

      // Dispose client component entrypoint when server component entrypoint is disposed.
      if (isServerComponentsEntry) {
        entries[page.replace('server/', 'client/')].dispose = true
      }
      entries[page].dispose = true
    }
  })
}

// Make sure only one invalidation happens at a time∫
// Otherwise, webpack hash gets changed and it'll force the client to reload.
class Invalidator {
  private multiCompiler: webpack.MultiCompiler
  private building: boolean
  public rebuildAgain: boolean

  constructor(multiCompiler: webpack.MultiCompiler) {
    this.multiCompiler = multiCompiler
    // contains an array of types of compilers currently building
    this.building = false
    this.rebuildAgain = false
  }

  invalidate(keys: string[] = []) {
    // If there's a current build is processing, we won't abort it by invalidating.
    // (If aborted, it'll cause a client side hard reload)
    // But let it to invalidate just after the completion.
    // So, it can re-build the queued pages at once.
    if (this.building) {
      this.rebuildAgain = true
      return
    }

    this.building = true

    if (!keys || keys.length === 0) {
      this.multiCompiler.compilers[0].watching.invalidate()
      this.multiCompiler.compilers[1].watching.invalidate()
      this.multiCompiler.compilers[2].watching.invalidate()
      return
    }

    for (const key of keys) {
      if (key === 'client') {
        this.multiCompiler.compilers[0].watching.invalidate()
      } else if (key === 'server') {
        this.multiCompiler.compilers[1].watching.invalidate()
      } else if (key === 'edgeServer') {
        this.multiCompiler.compilers[2].watching.invalidate()
      }
    }
  }

  startBuilding() {
    this.building = true
  }

  doneBuilding() {
    this.building = false

    if (this.rebuildAgain) {
      this.rebuildAgain = false
      this.invalidate()
    }
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
  pagesDir: string,
  page: string,
  extensions: string[],
  appDir?: string
) {
  const normalizedPagePath = tryToNormalizePagePath(page)
  let pagePath: string | null = null

  if (isMiddlewareFile(normalizedPagePath)) {
    pagePath = await findPageFile(rootDir, normalizedPagePath, extensions)

    if (!pagePath) {
      throw new PageNotFoundError(normalizedPagePath)
    }

    const pageUrl = ensureLeadingSlash(
      removePagePathTail(normalizePathSep(pagePath), {
        extensions,
      })
    )

    return {
      absolutePagePath: join(rootDir, pagePath),
      bundlePath: normalizedPagePath.slice(1),
      page: posix.normalize(pageUrl),
    }
  }

  // Check appDir first falling back to pagesDir
  if (appDir) {
    pagePath = await findPageFile(appDir, normalizedPagePath, extensions)
    if (pagePath) {
      const pageUrl = ensureLeadingSlash(
        removePagePathTail(normalizePathSep(pagePath), {
          keepIndex: true,
          extensions,
        })
      )

      return {
        absolutePagePath: join(appDir, pagePath),
        bundlePath: posix.join('app', normalizePagePath(pageUrl)),
        page: posix.normalize(pageUrl),
      }
    }
  }

  if (!pagePath) {
    pagePath = await findPageFile(pagesDir, normalizedPagePath, extensions)
  }

  if (pagePath !== null) {
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

function tryToNormalizePagePath(page: string) {
  try {
    return normalizePagePath(page)
  } catch (err) {
    console.error(err)
    throw new PageNotFoundError(page)
  }
}
