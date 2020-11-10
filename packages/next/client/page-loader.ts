import { ComponentType } from 'react'
import type { ClientSsgManifest } from '../build'
import type { ClientBuildManifest } from '../build/webpack/plugins/build-manifest-plugin'
import {
  addBasePath,
  addLocale,
  interpolateAs,
} from '../next-server/lib/router/router'
import getAssetPathFromRoute from '../next-server/lib/router/utils/get-asset-path-from-route'
import { isDynamicRoute } from '../next-server/lib/router/utils/is-dynamic'
import { parseRelativeUrl } from '../next-server/lib/router/utils/parse-relative-url'
import createRouteLoader, { RouteLoader } from './route-loader'

export const looseToArray = <T extends {}>(input: any): T[] =>
  [].slice.call(input)

export const INITIAL_CSS_LOAD_ERROR = Symbol('INITIAL_CSS_LOAD_ERROR')

function normalizeRoute(route: string) {
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
  private cssc: Record<string, Promise<string>>
  private promisedBuildManifest?: Promise<ClientBuildManifest>
  private promisedSsgManifest?: Promise<ClientSsgManifest>
  private promisedDevPagesManifest?: Promise<any>
  public routeLoader: RouteLoader

  constructor(buildId: string, assetPrefix: string) {
    this.routeLoader = createRouteLoader(assetPrefix)

    this.buildId = buildId
    this.assetPrefix = assetPrefix

    this.cssc = {}

    this.promisedBuildManifest = new Promise((resolve) => {
      if (self.__BUILD_MANIFEST) {
        resolve(self.__BUILD_MANIFEST)
      } else {
        const cb = self.__BUILD_MANIFEST_CB
        self.__BUILD_MANIFEST_CB = () => {
          resolve(self.__BUILD_MANIFEST)
          cb && cb()
        }
      }
    })

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
      return this.promisedBuildManifest!.then(
        (buildManifest) => buildManifest.sortedPages
      )
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
   */
  getDataHref(
    href: string,
    asPath: string,
    ssg: boolean,
    locale?: string | false
  ) {
    const { pathname: hrefPathname, query, search } = parseRelativeUrl(href)
    const { pathname: asPathname } = parseRelativeUrl(asPath)
    const route = normalizeRoute(hrefPathname)

    const getHrefForSlug = (path: string) => {
      const dataRoute = addLocale(getAssetPathFromRoute(path, '.json'), locale)
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
   * @param {string} href the route href (file-system path)
   */
  _isSsg(href: string): Promise<boolean> {
    const { pathname: hrefPathname } = parseRelativeUrl(href)
    const route = normalizeRoute(hrefPathname)
    return this.promisedSsgManifest!.then((s: ClientSsgManifest) =>
      s.has(route)
    )
  }

  async loadPage(route: string): Promise<GoodPageCache> {
    const res = await this.routeLoader.loadRoute(route)
    if ('component' in res) {
      return {
        page: res.component,
        mod: res.exports,
        styleSheets: res.styles.map((o) => ({ href: o.href, text: o.content })),
      }
    }
    throw res.error
  }

  prefetch(route: string): Promise<void> {
    return this.routeLoader.prefetch(route)
  }
}
