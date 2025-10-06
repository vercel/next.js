import type { ComponentType } from 'react'
import type { MiddlewareMatcher } from '../build/analysis/get-page-static-info'
import getAssetPathFromRoute from '../shared/lib/router/utils/get-asset-path-from-route'
import { __unsafeCreateTrustedScriptURL } from './trusted-types'
import { requestIdleCallback } from './request-idle-callback'
import { getDeploymentIdQueryOrEmptyString } from '../build/deployment-id'
import { encodeURIPath } from '../shared/lib/encode-uri-path'

// 3.8s was arbitrarily chosen as it's what https://web.dev/interactive
// considers as "Good" time-to-interactive. We must assume something went
// wrong beyond this point, and then fall-back to a full page transition to
// show the user something of value.
const MS_MAX_IDLE_DELAY = 3800

declare global {
  interface Window {
    __BUILD_MANIFEST?: Record<string, string[]>
    __BUILD_MANIFEST_CB?: Function
    __MIDDLEWARE_MATCHERS?: MiddlewareMatcher[]
    __MIDDLEWARE_MANIFEST_CB?: Function
    __REACT_LOADABLE_MANIFEST?: any
    __DYNAMIC_CSS_MANIFEST?: any
    __RSC_MANIFEST?: any
    __RSC_SERVER_MANIFEST?: any
    __NEXT_FONT_MANIFEST?: any
    __SUBRESOURCE_INTEGRITY_MANIFEST?: string
    __INTERCEPTION_ROUTE_REWRITE_MANIFEST?: string
  }
}

interface LoadedEntrypointSuccess {
  component: ComponentType
  exports: any
}
interface LoadedEntrypointFailure {
  error: unknown
}
type RouteEntrypoint = LoadedEntrypointSuccess | LoadedEntrypointFailure

interface RouteStyleSheet {
  href: string
  content: string
}

interface LoadedRouteSuccess extends LoadedEntrypointSuccess {
  styles: RouteStyleSheet[]
}
interface LoadedRouteFailure {
  error: unknown
}
type RouteLoaderEntry = LoadedRouteSuccess | LoadedRouteFailure

interface Future<V> {
  resolve: (entrypoint: V) => void
  future: Promise<V>
}
function withFuture<T extends object>(
  key: string,
  map: Map<string, Future<T> | T>,
  generator?: () => Promise<T>
): Promise<T> {
  let entry = map.get(key)
  if (entry) {
    if ('future' in entry) {
      return entry.future
    }
    return Promise.resolve(entry)
  }
  let resolver: (entrypoint: T) => void
  const prom: Promise<T> = new Promise<T>((resolve) => {
    resolver = resolve
  })
  map.set(key, { resolve: resolver!, future: prom })
  return generator
    ? generator()
        .then((value) => {
          resolver(value)
          return value
        })
        .catch((err) => {
          map.delete(key)
          throw err
        })
    : prom
}

export interface RouteLoader {
  whenEntrypoint(route: string): Promise<RouteEntrypoint>
  onEntrypoint(route: string, execute: () => unknown): void
  loadRoute(route: string, prefetch?: boolean): Promise<RouteLoaderEntry>
  prefetch(route: string): Promise<void>
}

const ASSET_LOAD_ERROR = Symbol('ASSET_LOAD_ERROR')
// TODO: unexport
export function markAssetError(err: Error): Error {
  return Object.defineProperty(err, ASSET_LOAD_ERROR, {})
}

export function isAssetError(err?: Error): boolean | undefined {
  return err && ASSET_LOAD_ERROR in err
}

function hasPrefetch(link?: HTMLLinkElement): boolean {
  try {
    link = document.createElement('link')
    return (
      // detect IE11 since it supports prefetch but isn't detected
      // with relList.support
      (!!window.MSInputMethodContext && !!(document as any).documentMode) ||
      link.relList.supports('prefetch')
    )
  } catch {
    return false
  }
}

const canPrefetch: boolean = hasPrefetch()

const getAssetQueryString = () => {
  return getDeploymentIdQueryOrEmptyString()
}

function prefetchViaDom(
  href: string,
  as: string,
  link?: HTMLLinkElement
): Promise<any> {
  return new Promise<void>((resolve, reject) => {
    const selector = `
      link[rel="prefetch"][href^="${href}"],
      link[rel="preload"][href^="${href}"],
      script[src^="${href}"]`
    if (document.querySelector(selector)) {
      return resolve()
    }

    link = document.createElement('link')

    // The order of property assignment here is intentional:
    if (as) link!.as = as
    link!.rel = `prefetch`
    link!.crossOrigin = process.env.__NEXT_CROSS_ORIGIN!
    link!.onload = resolve as any
    link!.onerror = () =>
      reject(markAssetError(new Error(`Failed to prefetch: ${href}`)))

    // `href` should always be last:
    link!.href = href

    document.head.appendChild(link)
  })
}

function appendScript(
  src: TrustedScriptURL | string,
  script?: HTMLScriptElement
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    script = document.createElement('script')

    // The order of property assignment here is intentional.
    // 1. Setup success/failure hooks in case the browser synchronously
    //    executes when `src` is set.
    script.onload = resolve
    script.onerror = () =>
      reject(markAssetError(new Error(`Failed to load script: ${src}`)))

    // 2. Configure the cross-origin attribute before setting `src` in case the
    //    browser begins to fetch.
    script.crossOrigin = process.env.__NEXT_CROSS_ORIGIN!

    // 3. Finally, set the source and inject into the DOM in case the child
    //    must be appended for fetching to start.
    script.src = src as string
    document.body.appendChild(script)
  })
}

// We wait for pages to be built in dev before we start the route transition
// timeout to prevent an un-necessary hard navigation in development.
let devBuildPromise: Promise<void> | undefined

// Resolve a promise that times out after given amount of milliseconds.
function resolvePromiseWithTimeout<T>(
  p: Promise<T>,
  ms: number,
  err: Error
): Promise<T> {
  return new Promise((resolve, reject) => {
    let cancelled = false

    p.then((r) => {
      // Resolved, cancel the timeout
      cancelled = true
      resolve(r)
    }).catch(reject)

    // We wrap these checks separately for better dead-code elimination in
    // production bundles.
    if (process.env.NODE_ENV === 'development') {
      ;(devBuildPromise || Promise.resolve()).then(() => {
        requestIdleCallback(() =>
          setTimeout(() => {
            if (!cancelled) {
              reject(err)
            }
          }, ms)
        )
      })
    }

    if (process.env.NODE_ENV !== 'development') {
      requestIdleCallback(() =>
        setTimeout(() => {
          if (!cancelled) {
            reject(err)
          }
        }, ms)
      )
    }
  })
}

// TODO: stop exporting or cache the failure
// It'd be best to stop exporting this. It's an implementation detail. We're
// only exporting it for backwards compatibility with the `page-loader`.
// Only cache this response as a last resort if we cannot eliminate all other
// code branches that use the Build Manifest Callback and push them through
// the Route Loader interface.
export function getClientBuildManifest() {
  if (self.__BUILD_MANIFEST) {
    return Promise.resolve(self.__BUILD_MANIFEST)
  }

  const onBuildManifest = new Promise<Record<string, string[]>>((resolve) => {
    // Mandatory because this is not concurrent safe:
    const cb = self.__BUILD_MANIFEST_CB
    self.__BUILD_MANIFEST_CB = () => {
      resolve(self.__BUILD_MANIFEST!)
      cb && cb()
    }
  })

  return resolvePromiseWithTimeout(
    onBuildManifest,
    MS_MAX_IDLE_DELAY,
    markAssetError(new Error('Failed to load client build manifest'))
  )
}

interface RouteFiles {
  scripts: (TrustedScriptURL | string)[]
  css: string[]
}
function getFilesForRoute(
  assetPrefix: string,
  route: string
): Promise<RouteFiles> {
  if (process.env.NODE_ENV === 'development') {
    const scriptUrl =
      assetPrefix +
      '/_next/static/chunks/pages' +
      encodeURIPath(getAssetPathFromRoute(route, '.js')) +
      getAssetQueryString()
    return Promise.resolve({
      scripts: [__unsafeCreateTrustedScriptURL(scriptUrl)],
      // Styles are handled by `style-loader` in development:
      css: [],
    })
  }
  return getClientBuildManifest().then((manifest) => {
    if (!(route in manifest)) {
      throw markAssetError(new Error(`Failed to lookup route: ${route}`))
    }
    const allFiles = manifest[route].map(
      (entry) => assetPrefix + '/_next/' + encodeURIPath(entry)
    )
    return {
      scripts: allFiles
        .filter((v) => v.endsWith('.js'))
        .map((v) => __unsafeCreateTrustedScriptURL(v) + getAssetQueryString()),
      css: allFiles
        .filter((v) => v.endsWith('.css'))
        .map((v) => v + getAssetQueryString()),
    }
  })
}

export function createRouteLoader(assetPrefix: string): RouteLoader {
  const entrypoints: Map<string, Future<RouteEntrypoint> | RouteEntrypoint> =
    new Map()
  const loadedScripts: Map<string, Promise<unknown>> = new Map()
  const styleSheets: Map<string, Promise<RouteStyleSheet>> = new Map()
  const routes: Map<string, Future<RouteLoaderEntry> | RouteLoaderEntry> =
    new Map()

  function maybeExecuteScript(
    src: TrustedScriptURL | string
  ): Promise<unknown> {
    // With HMR we might need to "reload" scripts when they are
    // disposed and readded. Executing scripts twice has no functional
    // differences
    if (process.env.NODE_ENV !== 'development') {
      let prom: Promise<unknown> | undefined = loadedScripts.get(src.toString())
      if (prom) {
        return prom
      }

      // Skip executing script if it's already in the DOM:
      if (document.querySelector(`script[src^="${src}"]`)) {
        return Promise.resolve()
      }

      loadedScripts.set(src.toString(), (prom = appendScript(src)))
      return prom
    } else {
      return appendScript(src)
    }
  }

  function fetchStyleSheet(href: string): Promise<RouteStyleSheet> {
    let prom: Promise<RouteStyleSheet> | undefined = styleSheets.get(href)
    if (prom) {
      return prom
    }

    styleSheets.set(
      href,
      (prom = fetch(href, { credentials: 'same-origin' })
        .then((res) => {
          if (!res.ok) {
            throw new Error(`Failed to load stylesheet: ${href}`)
          }
          return res.text().then((text) => ({ href: href, content: text }))
        })
        .catch((err) => {
          throw markAssetError(err)
        }))
    )
    return prom
  }

  return {
    whenEntrypoint(route: string) {
      return withFuture(route, entrypoints)
    },
    onEntrypoint(route: string, execute: undefined | (() => unknown)) {
      ;(execute
        ? Promise.resolve()
            .then(() => execute())
            .then(
              (exports: any) => ({
                component: (exports && exports.default) || exports,
                exports: exports,
              }),
              (err) => ({ error: err })
            )
        : Promise.resolve(undefined)
      ).then((input: RouteEntrypoint | undefined) => {
        const old = entrypoints.get(route)
        if (old && 'resolve' in old) {
          if (input) {
            entrypoints.set(route, input)
            old.resolve(input)
          }
        } else {
          if (input) {
            entrypoints.set(route, input)
          } else {
            entrypoints.delete(route)
          }
          // when this entrypoint has been resolved before
          // the route is outdated and we want to invalidate
          // this cache entry
          routes.delete(route)
        }
      })
    },
    loadRoute(route: string, prefetch?: boolean) {
      return withFuture<RouteLoaderEntry>(route, routes, () => {
        let devBuildPromiseResolve: () => void

        if (process.env.NODE_ENV === 'development') {
          devBuildPromise = new Promise<void>((resolve) => {
            devBuildPromiseResolve = resolve
          })
        }

        return resolvePromiseWithTimeout(
          getFilesForRoute(assetPrefix, route)
            .then(({ scripts, css }) => {
              return Promise.all([
                entrypoints.has(route)
                  ? []
                  : Promise.all(scripts.map(maybeExecuteScript)),
                Promise.all(css.map(fetchStyleSheet)),
              ] as const)
            })
            .then((res) => {
              return this.whenEntrypoint(route).then((entrypoint) => ({
                entrypoint,
                styles: res[1],
              }))
            }),
          MS_MAX_IDLE_DELAY,
          markAssetError(new Error(`Route did not complete loading: ${route}`))
        )
          .then(({ entrypoint, styles }) => {
            const res: RouteLoaderEntry = Object.assign<
              { styles: RouteStyleSheet[] },
              RouteEntrypoint
            >({ styles: styles! }, entrypoint)
            return 'error' in entrypoint ? entrypoint : res
          })
          .catch((err) => {
            if (prefetch) {
              // we don't want to cache errors during prefetch
              throw err
            }
            return { error: err }
          })
          .finally(() => devBuildPromiseResolve?.())
      })
    },
    prefetch(route: string): Promise<void> {
      // https://github.com/GoogleChromeLabs/quicklink/blob/453a661fa1fa940e2d2e044452398e38c67a98fb/src/index.mjs#L115-L118
      // License: Apache 2.0
      let cn
      if ((cn = (navigator as any).connection)) {
        // Don't prefetch if using 2G or if Save-Data is enabled.
        if (cn.saveData || /2g/.test(cn.effectiveType)) return Promise.resolve()
      }
      return getFilesForRoute(assetPrefix, route)
        .then((output) =>
          Promise.all(
            canPrefetch
              ? output.scripts.map((script) =>
                  prefetchViaDom(script.toString(), 'script')
                )
              : []
          )
        )
        .then(() => {
          requestIdleCallback(() => this.loadRoute(route, true).catch(() => {}))
        })
        .catch(
          // swallow prefetch errors
          () => {}
        )
    },
  }
}
