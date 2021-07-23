import { ComponentType } from 'react'
import { ClientSsgManifest } from '../build'
import {
  addBasePath,
  addLocale,
  interpolateAs,
} from '../shared/lib/router/router'
import getAssetPathFromRoute from '../shared/lib/router/utils/get-asset-path-from-route'
import { isDynamicRoute } from '../shared/lib/router/utils/is-dynamic'
import { parseRelativeUrl } from '../shared/lib/router/utils/parse-relative-url'
import { removePathTrailingSlash } from './normalize-trailing-slash'
import {
  createRouteLoader,
  getClientBuildManifest,
  RouteLoader,
} from './route-loader'

function normalizeRoute(route: string): string {
  if (route[0] !== '/') {
    throw new Error(`Route name should start with a "/", got "${route}"`)
  }

  if (route === '/') return route
  return route.replace(/\/$/, '')
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

  private promisedSsgManifest?: Promise<ClientSsgManifest>
  private promisedDevPagesManifest?: Promise<any>
  public routeLoader: RouteLoader

  constructor(buildId: string, assetPrefix: string) {
    this.routeLoader = createRouteLoader(assetPrefix)

    this.buildId = buildId
    this.assetPrefix = assetPrefix

    /** @type {Promise<Set<string>>} */
    this.promisedSsgManifest = new Promise((resolve) => {
      if ((window as any).__SSG_MANIFEST) {
        resolve((window as any).__SSG_MANIFEST)
      } else {
        ;(window as any).__SSG_MANIFEST_CB = () => {
          resolve((window as any).__SSG_MANIFEST)
        }
      }
    })
  }

  getPageList() {
    if (process.env.NODE_ENV === 'production') {
      return getClientBuildManifest().then((manifest) => manifest.sortedPages)
    } else {
      if ((window as any).__DEV_PAGES_MANIFEST) {
        return (window as any).__DEV_PAGES_MANIFEST.pages
      } else {
        if (!this.promisedDevPagesManifest) {
          this.promisedDevPagesManifest = fetch(
            `${this.assetPrefix}/_next/static/development/_devPagesManifest.json`
          )
            .then((res) => res.json())
            .then((manifest) => {
              ;(window as any).__DEV_PAGES_MANIFEST = manifest
              return manifest.pages
            })
            .catch((err) => {
              console.log(`Failed to fetch devPagesManifest`, err)
            })
        }
        return this.promisedDevPagesManifest
      }
    }
  }

  /**
   * @param {string} href the route href (file-system path)
   * @param {string} asPath the URL as shown in browser (virtual path); used for dynamic routes
   * @returns {string}
   */
  getDataHref(
    href: string,
    asPath: string,
    ssg: boolean,
    locale?: string | false
  ): string {
    const { pathname: hrefPathname, query, search } = parseRelativeUrl(href)
    const { pathname: asPathname } = parseRelativeUrl(asPath)
    const route = normalizeRoute(hrefPathname)

    const getHrefForSlug = (path: string) => {
      const dataRoute = getAssetPathFromRoute(
        removePathTrailingSlash(addLocale(path, locale)),
        '.json'
      )
      return addBasePath(
        `/_next/data/${this.buildId}${dataRoute}${ssg ? '' : search}`
      )
    }

    const isDynamic: boolean = isDynamicRoute(route)
    const interpolatedRoute = isDynamic
      ? interpolateAs(hrefPathname, asPathname, query).result
      : ''

    return isDynamic
      ? interpolatedRoute && getHrefForSlug(interpolatedRoute)
      : getHrefForSlug(route)
  }

  /**
   * @param {string} route - the route (file-system path)
   */
  _isSsg(route: string): Promise<boolean> {
    return this.promisedSsgManifest!.then((s: ClientSsgManifest) =>
      s.has(route)
    )
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
