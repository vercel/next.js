import { EventEmitter } from 'events'
import { IncomingMessage, ServerResponse } from 'http'
import { join, posix } from 'path'
import { parse } from 'url'
import { webpack, isWebpack5 } from 'next/dist/compiled/webpack/webpack'
import * as Log from '../../build/output/log'
import { normalizePagePath, normalizePathSep } from '../normalize-page-path'
import { pageNotFoundError } from '../require'
import { findPageFile } from '../lib/find-page-file'
import getRouteFromEntrypoint from '../get-route-from-entrypoint'
import { API_ROUTE, MIDDLEWARE_ROUTE } from '../../lib/constants'

export const ADDED = Symbol('added')
export const BUILDING = Symbol('building')
export const BUILT = Symbol('built')

export let entries: {
  [page: string]: {
    bundlePath: string
    absolutePagePath: string
    status?: typeof ADDED | typeof BUILDING | typeof BUILT
    lastActiveTime?: number
  }
} = {}

export default function onDemandEntryHandler(
  watcher: any,
  multiCompiler: webpack.MultiCompiler,
  {
    pagesDir,
    pageExtensions,
    maxInactiveAge,
    pagesBufferLength,
  }: {
    pagesDir: string
    pageExtensions: string[]
    maxInactiveAge: number
    pagesBufferLength: number
  }
) {
  const { compilers } = multiCompiler
  const invalidator = new Invalidator(watcher, multiCompiler)

  let lastClientAccessPages = ['']
  let doneCallbacks: EventEmitter | null = new EventEmitter()

  for (const compiler of compilers) {
    compiler.hooks.make.tap(
      'NextJsOnDemandEntries',
      (_compilation: webpack.compilation.Compilation) => {
        invalidator.startBuilding()
      }
    )
  }

  function getPagePathsFromEntrypoints(
    type: string,
    entrypoints: any
  ): string[] {
    const pagePaths = []
    for (const entrypoint of entrypoints.values()) {
      const page = getRouteFromEntrypoint(entrypoint.name)
      if (page) {
        pagePaths.push(`${type}${page}`)
      }
    }

    return pagePaths
  }

  multiCompiler.hooks.done.tap('NextJsOnDemandEntries', (multiStats) => {
    if (invalidator.rebuildAgain) {
      return invalidator.doneBuilding()
    }
    const [clientStats, serverStats] = multiStats.stats
    const pagePaths = [
      ...getPagePathsFromEntrypoints(
        'client',
        clientStats.compilation.entrypoints
      ),
      ...getPagePathsFromEntrypoints(
        'server',
        serverStats.compilation.entrypoints
      ),
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

  const disposeHandler = setInterval(function () {
    disposeInactiveEntries(watcher, lastClientAccessPages, maxInactiveAge)
  }, 5000)

  disposeHandler.unref()

  function handlePing(pg: string) {
    const page = normalizePathSep(pg)
    const pageKey = `client${page}`
    const entryInfo = entries[pageKey]
    let toSend

    // If there's no entry, it may have been invalidated and needs to be re-built.
    if (!entryInfo) {
      // if (page !== lastEntry) client pings, but there's no entry for page
      return { invalid: true }
    }

    // 404 is an on demand entry but when a new page is added we have to refresh the page
    if (page === '/_error') {
      toSend = { invalid: true }
    } else {
      toSend = { success: true }
    }

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
    return toSend
  }

  return {
    async ensurePage(page: string, clientOnly: boolean) {
      let normalizedPagePath: string
      try {
        normalizedPagePath = normalizePagePath(page)
      } catch (err) {
        console.error(err)
        throw pageNotFoundError(page)
      }

      let pagePath = await findPageFile(
        pagesDir,
        normalizedPagePath,
        pageExtensions
      )

      // Default the /_error route to the Next.js provided default page
      if (page === '/_error' && pagePath === null) {
        pagePath = 'next/dist/pages/_error'
      }

      if (pagePath === null) {
        throw pageNotFoundError(normalizedPagePath)
      }

      let pageUrl = pagePath.replace(/\\/g, '/')

      pageUrl = `${pageUrl[0] !== '/' ? '/' : ''}${pageUrl
        .replace(new RegExp(`\\.+(?:${pageExtensions.join('|')})$`), '')
        .replace(/\/index$/, '')}`

      pageUrl = pageUrl === '' ? '/' : pageUrl

      const bundleFile = normalizePagePath(pageUrl)
      const bundlePath = posix.join('pages', bundleFile)
      const absolutePagePath = pagePath.startsWith('next/dist/pages')
        ? require.resolve(pagePath)
        : join(pagesDir, pagePath)

      page = posix.normalize(pageUrl)
      const normalizedPage = normalizePathSep(page)

      const isApiRoute = normalizedPage.match(API_ROUTE)
      const isMiddleware = normalizedPage.match(MIDDLEWARE_ROUTE)

      let entriesChanged = false
      const addPageEntry = (type: 'client' | 'server') => {
        return new Promise<void>((resolve, reject) => {
          // Makes sure the page that is being kept in on-demand-entries matches the webpack output
          const pageKey = `${type}${normalizedPage}`
          const entryInfo = entries[pageKey]

          if (entryInfo) {
            entryInfo.lastActiveTime = Date.now()
            if (entryInfo.status === BUILT) {
              resolve()
              return
            }

            doneCallbacks!.once(pageKey, handleCallback)
            return
          }

          entriesChanged = true

          entries[pageKey] = {
            bundlePath,
            absolutePagePath,
            status: ADDED,
            lastActiveTime: Date.now(),
          }
          doneCallbacks!.once(pageKey, handleCallback)

          function handleCallback(err: Error) {
            if (err) return reject(err)
            resolve()
          }
        })
      }

      const promise = isApiRoute
        ? addPageEntry('server')
        : clientOnly || isMiddleware
        ? addPageEntry('client')
        : Promise.all([addPageEntry('client'), addPageEntry('server')])

      if (entriesChanged) {
        Log.event(
          isApiRoute || isMiddleware
            ? `build page: ${normalizedPage} (server only)`
            : clientOnly
            ? `build page: ${normalizedPage} (client only)`
            : `build page: ${normalizedPage}`
        )
        invalidator.invalidate()
      }

      return promise
    },

    middleware(req: IncomingMessage, res: ServerResponse, next: Function) {
      if (!req.url?.startsWith('/_next/webpack-hmr')) return next()

      const { query } = parse(req.url!, true)
      const page = query.page
      if (!page) return next()

      const runPing = () => {
        const data = handlePing(query.page as string)
        if (!data) return
        res.write('data: ' + JSON.stringify(data) + '\n\n')
      }
      const pingInterval = setInterval(() => runPing(), 5000)

      req.on('close', () => {
        clearInterval(pingInterval)
      })
      next()
    },
  }
}

function disposeInactiveEntries(
  _watcher: any,
  lastClientAccessPages: any,
  maxInactiveAge: number
) {
  const disposingPages: any = []

  Object.keys(entries).forEach((page) => {
    const { lastActiveTime, status } = entries[page]

    // This means this entry is currently building or just added
    // We don't need to dispose those entries.
    if (status !== BUILT) return

    // We should not build the last accessed page even we didn't get any pings
    // Sometimes, it's possible our XHR ping to wait before completing other requests.
    // In that case, we should not dispose the current viewing page
    if (lastClientAccessPages.includes(page)) return

    if (lastActiveTime && Date.now() - lastActiveTime > maxInactiveAge) {
      disposingPages.push(page)
    }
  })

  if (disposingPages.length > 0) {
    disposingPages.forEach((page: any) => {
      delete entries[page]
    })
    // disposing inactive page(s)
    // watcher.invalidate()
  }
}

// Make sure only one invalidation happens at a time
// Otherwise, webpack hash gets changed and it'll force the client to reload.
class Invalidator {
  private multiCompiler: webpack.MultiCompiler
  private watcher: any
  private building: boolean
  public rebuildAgain: boolean

  constructor(watcher: any, multiCompiler: webpack.MultiCompiler) {
    this.multiCompiler = multiCompiler
    this.watcher = watcher
    // contains an array of types of compilers currently building
    this.building = false
    this.rebuildAgain = false
  }

  invalidate() {
    // If there's a current build is processing, we won't abort it by invalidating.
    // (If aborted, it'll cause a client side hard reload)
    // But let it to invalidate just after the completion.
    // So, it can re-build the queued pages at once.
    if (this.building) {
      this.rebuildAgain = true
      return
    }

    this.building = true
    if (!isWebpack5) {
      // Work around a bug in webpack, calling `invalidate` on Watching.js
      // doesn't trigger the invalid call used to keep track of the `.done` hook on multiCompiler
      for (const compiler of this.multiCompiler.compilers) {
        compiler.hooks.invalid.call()
      }
    }

    this.watcher.invalidate()
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
