import type { ComponentType } from 'react'
import type { RouteLoader } from './route-loader'
import { addBasePath } from './add-base-path'
import { interpolateAs } from '../shared/lib/router/router'
import getAssetPathFromRoute from '../shared/lib/router/utils/get-asset-path-from-route'
import { addLocale } from './add-locale'
import { isDynamicRoute } from '../shared/lib/router/utils/is-dynamic'
import { parseRelativeUrl } from '../shared/lib/router/utils/parse-relative-url'
import { removeTrailingSlash } from '../shared/lib/router/utils/remove-trailing-slash'
import { createRouteLoader, getClientBuildManifest } from './route-loader'

declare global {
  interface Window {
    __DEV_MIDDLEWARE_MANIFEST?: [location: string, isSSR: boolean][]
    __DEV_PAGES_MANIFEST?: { pages: string[] }
    __SSG_MANIFEST_CB?: () => void
    __SSG_MANIFEST?: Set<string>
  }
}

export type StyleSheetTuple = { href: string; text: string }
export type GoodPageCache = {
  page: ComponentType
  mod: any
  styleSheets: StyleSheetTuple[]
}

export default class PageLoader {
  private buildId: string
  private assetPrefix: string
  private promisedSsgManifest: Promise<Set<string>>
  private promisedDevPagesManifest?: Promise<string[]>
  private promisedMiddlewareManifest?: Promise<
    [location: string, isSSR: boolean][]
  >

  public routeLoader: RouteLoader

  constructor(buildId: string, assetPrefix: string) {
    this.routeLoader = createRouteLoader(assetPrefix)

    this.buildId = buildId
    this.assetPrefix = assetPrefix

    this.promisedSsgManifest = new Promise((resolve) => {
      if (window.__SSG_MANIFEST) {
        resolve(window.__SSG_MANIFEST)
      } else {
        window.__SSG_MANIFEST_CB = () => {
          resolve(window.__SSG_MANIFEST!)
        }
      }
    })
  }

  getPageList() {
    if (process.env.NODE_ENV === 'production') {
      return getClientBuildManifest().then((manifest) => manifest.sortedPages)
    } else {
      if (window.__DEV_PAGES_MANIFEST) {
        return window.__DEV_PAGES_MANIFEST.pages
      } else {
        if (!this.promisedDevPagesManifest) {
          // TODO: Decide what should happen when fetching fails instead of asserting
          // @ts-ignore
          this.promisedDevPagesManifest = fetch(
            `${this.assetPrefix}/_next/static/development/_devPagesManifest.json`
          )
            .then((res) => res.json())
            .then((manifest: { pages: string[] }) => {
              window.__DEV_PAGES_MANIFEST = manifest
              return manifest.pages
            })
            .catch((err) => {
              console.log(`Failed to fetch devPagesManifest`, err)
            })
        }
        // TODO Remove this assertion as this could be undefined
        return this.promisedDevPagesManifest!
      }
    }
  }

  getMiddlewareList() {
    if (process.env.NODE_ENV === 'production') {
      const middlewareRegex = process.env.__NEXT_MIDDLEWARE_REGEX
      window.__MIDDLEWARE_MANIFEST = middlewareRegex
        ? [[middlewareRegex, false]]
        : []
      return window.__MIDDLEWARE_MANIFEST
    } else {
      if (window.__DEV_MIDDLEWARE_MANIFEST) {
        return window.__DEV_MIDDLEWARE_MANIFEST
      } else {
        if (!this.promisedMiddlewareManifest) {
          // TODO: Decide what should happen when fetching fails instead of asserting
          // @ts-ignore
          this.promisedMiddlewareManifest = fetch(
            `${this.assetPrefix}/_next/static/${this.buildId}/_devMiddlewareManifest.json`
          )
            .then((res) => res.json())
            .then((manifest: [location: string, isSSR: boolean][]) => {
              window.__DEV_MIDDLEWARE_MANIFEST = manifest
              return manifest
            })
            .catch((err) => {
              console.log(`Failed to fetch _devMiddlewareManifest`, err)
            })
        }
        // TODO Remove this assertion as this could be undefined
        return this.promisedMiddlewareManifest!
      }
    }
  }

  getDataHref(params: {
    asPath: string
    href: string
    locale?: string | false
    skipInterpolation?: boolean
  }): string {
    const { asPath, href, locale } = params
    const { pathname: hrefPathname, query, search } = parseRelativeUrl(href)
    const { pathname: asPathname } = parseRelativeUrl(asPath)
    const route = removeTrailingSlash(hrefPathname)
    if (route[0] !== '/') {
      throw new Error(`Route name should start with a "/", got "${route}"`)
    }

    const getHrefForSlug = (path: string) => {
      const dataRoute = getAssetPathFromRoute(
        removeTrailingSlash(addLocale(path, locale)),
        '.json'
      )
      return addBasePath(
        `/_next/data/${this.buildId}${dataRoute}${search}`,
        true
      )
    }

    return getHrefForSlug(
      params.skipInterpolation
        ? asPathname
        : isDynamicRoute(route)
        ? interpolateAs(hrefPathname, asPathname, query).result
        : route
    )
  }

  /**
   * @param {string} route - the route (file-system path)
   */
  _isSsg(route: string): Promise<boolean> {
    return this.promisedSsgManifest.then((manifest) => manifest.has(route))
  }

  loadPage(route: string): Promise<GoodPageCache> {
    return this.routeLoader.loadRoute(route).then((res) => {
      if ('component' in res) {
        return {
          page: res.component,
          mod: res.exports,
          styleSheets: res.styles.map((o) => ({
            href: o.href,
            text: o.content,
          })),
        }
      }
      throw res.error
    })
  }

  prefetch(route: string): Promise<void> {
    return this.routeLoader.prefetch(route)
  }
}
