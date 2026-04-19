import type { webpack } from 'next/dist/compiled/webpack/webpack'
import type { ProxyConfig } from '../../../analysis/get-page-static-info'

import { stringify } from 'querystring'
import {
  type ModuleBuildInfo,
  getModuleBuildInfo,
} from '../get-module-build-info'
import { RouteKind } from '../../../../server/route-kind'
import { normalizePagePath } from '../../../../shared/lib/page-path/normalize-page-path'
import { decodeFromBase64, encodeToBase64 } from '../utils'
import { isInstrumentationHookFile } from '../../../utils'
import { loadEntrypoint } from '../../../load-entrypoint'
import type { MappedPages } from '../../../build-context'

type RouteLoaderOptionsPagesAPIInput = {
  kind: RouteKind.PAGES_API
  page: string
  preferredRegion: string | string[] | undefined
  absolutePagePath: string
  middlewareConfig: ProxyConfig
}

type RouteLoaderOptionsPagesInput = {
  kind: RouteKind.PAGES
  page: string
  pages: MappedPages
  preferredRegion: string | string[] | undefined
  absolutePagePath: string
  middlewareConfig: ProxyConfig
}

type RouteLoaderOptionsInput =
  | RouteLoaderOptionsPagesInput
  | RouteLoaderOptionsPagesAPIInput

type RouteLoaderPagesAPIOptions = {
  kind: RouteKind.PAGES_API

  /**
   * The page name for this particular route.
   */
  page: string

  /**
   * The preferred region for this route.
   */
  preferredRegion: string | string[] | undefined

  /**
   * The absolute path to the userland page file.
   */
  absolutePagePath: string

  /**
   * The middleware config for this route.
   */
  middlewareConfigBase64: string
}

type RouteLoaderPagesOptions = {
  kind: RouteKind.PAGES

  /**
   * The page name for this particular route.
   */
  page: string

  /**
   * The preferred region for this route.
   */
  preferredRegion: string | string[] | undefined

  /**
   * The absolute path to the userland page file.
   */
  absolutePagePath: string

  /**
   * The absolute paths to the app path file.
   */
  absoluteAppPath: string

  /**
   * The absolute paths to the document path file.
   */
  absoluteDocumentPath: string

  /**
   * The middleware config for this route.
   */
  middlewareConfigBase64: string
}

/**
 * The options for the route loader.
 */
type RouteLoaderOptions = RouteLoaderPagesOptions | RouteLoaderPagesAPIOptions

/**
 * Returns the loader entry for a given page.
 *
 * @param options the options to create the loader entry
 * @returns the encoded loader entry
 */
export function getRouteLoaderEntry(options: RouteLoaderOptionsInput): string {
  switch (options.kind) {
    case RouteKind.PAGES: {
      const query: RouteLoaderPagesOptions = {
        kind: options.kind,
        page: options.page,
        preferredRegion: options.preferredRegion,
        absolutePagePath: options.absolutePagePath,
        // These are the path references to the internal components that may be
        // overridden by userland components.
        absoluteAppPath: options.pages['/_app'],
        absoluteDocumentPath: options.pages['/_document'],
        middlewareConfigBase64: encodeToBase64(options.middlewareConfig),
      }

      return `next-route-loader?${stringify(query)}!`
    }
    case RouteKind.PAGES_API: {
      const query: RouteLoaderPagesAPIOptions = {
        kind: options.kind,
        page: options.page,
        preferredRegion: options.preferredRegion,
        absolutePagePath: options.absolutePagePath,
        middlewareConfigBase64: encodeToBase64(options.middlewareConfig),
      }

      return `next-route-loader?${stringify(query)}!`
    }
    default: {
      throw new Error('Invariant: Unexpected route kind')
    }
  }
}

const loadPages = async (
  {
    page,
    absolutePagePath,
    absoluteDocumentPath,
    absoluteAppPath,
    preferredRegion,
    middlewareConfigBase64,
  }: RouteLoaderPagesOptions,
  buildInfo: ModuleBuildInfo
) => {
  const middlewareConfig: ProxyConfig = decodeFromBase64(middlewareConfigBase64)

  // Attach build info to the module.
  buildInfo.route = {
    page,
    absolutePagePath,
    preferredRegion,
    middlewareConfig,
  }

  let file = await loadEntrypoint('pages', {
    VAR_USERLAND: absolutePagePath,
    VAR_MODULE_DOCUMENT: absoluteDocumentPath,
    VAR_MODULE_APP: absoluteAppPath,
    VAR_DEFINITION_PAGE: normalizePagePath(page),
    VAR_DEFINITION_PATHNAME: page,
  })

  if (isInstrumentationHookFile(page)) {
    // When we're building the instrumentation page (only when the
    // instrumentation file conflicts with a page also labeled
    // /instrumentation) hoist the `register` method.
    file += '\nexport const register = hoist(userland, "register")'
  }

  return file
}

const loadPagesAPI = async (
  {
    page,
    absolutePagePath,
    preferredRegion,
    middlewareConfigBase64,
  }: RouteLoaderPagesAPIOptions,
  buildInfo: ModuleBuildInfo
) => {
  const middlewareConfig: ProxyConfig = decodeFromBase64(middlewareConfigBase64)

  // Attach build info to the module.
  buildInfo.route = {
    page,
    absolutePagePath,
    preferredRegion,
    middlewareConfig,
  }

  return await loadEntrypoint('pages-api', {
    VAR_USERLAND: absolutePagePath,
    VAR_DEFINITION_PAGE: normalizePagePath(page),
    VAR_DEFINITION_PATHNAME: page,
  })
}

/**
 * Handles the `next-route-loader` options.
 * @returns the loader definition function
 */
const loader: webpack.LoaderDefinitionFunction<RouteLoaderOptions> =
  async function () {
    if (!this._module) {
      throw new Error('Invariant: expected this to reference a module')
    }

    const buildInfo = getModuleBuildInfo(this._module)
    const opts = this.getOptions()

    switch (opts.kind) {
      case RouteKind.PAGES: {
        return await loadPages(opts, buildInfo)
      }
      case RouteKind.PAGES_API: {
        return await loadPagesAPI(opts, buildInfo)
      }
      default: {
        throw new Error('Invariant: Unexpected route kind')
      }
    }
  }

export default loader
