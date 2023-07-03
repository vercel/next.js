import type { webpack } from 'next/dist/compiled/webpack/webpack'

import { stringify } from 'querystring'
import { ModuleBuildInfo, getModuleBuildInfo } from '../get-module-build-info'
import { PagesRouteModuleOptions } from '../../../../server/future/route-modules/pages/module'
import { RouteKind } from '../../../../server/future/route-kind'
import { normalizePagePath } from '../../../../shared/lib/page-path/normalize-page-path'
import { MiddlewareConfig } from '../../../analysis/get-page-static-info'
import { decodeFromBase64, encodeToBase64 } from '../utils'
import { isInstrumentationHookFile } from '../../../worker'
import { PagesAPIRouteModuleOptions } from '../../../../server/future/route-modules/pages-api/module'

type RouteLoaderOptionsPagesAPIInput = {
  kind: RouteKind.PAGES_API
  page: string
  preferredRegion: string | string[] | undefined
  absolutePagePath: string
}

type RouteLoaderOptionsPagesInput = {
  kind: RouteKind.PAGES
  page: string
  pages: { [page: string]: string }
  preferredRegion: string | string[] | undefined
  absolutePagePath: string
  middlewareConfig: MiddlewareConfig
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
      }

      return `next-route-loader?${stringify(query)}!`
    }
    default: {
      throw new Error('Invariant: Unexpected route kind')
    }
  }
}

const loadPages = (
  opts: RouteLoaderPagesOptions,
  buildInfo: ModuleBuildInfo
) => {
  const {
    page,
    absolutePagePath,
    absoluteDocumentPath,
    absoluteAppPath,
    preferredRegion,
    middlewareConfigBase64,
  } = opts

  // Ensure we only run this loader for as a module.

  const middlewareConfig: MiddlewareConfig = decodeFromBase64(
    middlewareConfigBase64
  )

  // Attach build info to the module.
  buildInfo.route = {
    page,
    absolutePagePath,
    preferredRegion,
    middlewareConfig,
  }

  const options: Omit<PagesRouteModuleOptions, 'userland' | 'components'> = {
    definition: {
      kind: RouteKind.PAGES,
      page: normalizePagePath(page),
      pathname: page,
      // The following aren't used in production.
      bundlePath: '',
      filename: '',
    },
  }

  return `
      // Next.js Route Loader
      import RouteModule from "next/dist/server/future/route-modules/pages/module"
      import { hoist } from "next/dist/build/webpack/loaders/next-route-loader/helpers"

      // Import the app and document modules.
      import * as moduleDocument from ${JSON.stringify(absoluteDocumentPath)}
      import * as moduleApp from ${JSON.stringify(absoluteAppPath)}

      // Import the userland code.
      import * as userland from ${JSON.stringify(absolutePagePath)}

      // Re-export the component (should be the default export).
      export default hoist(userland, "default")

      // Re-export methods.
      export const getStaticProps = hoist(userland, "getStaticProps")
      export const getStaticPaths = hoist(userland, "getStaticPaths")
      export const getServerSideProps = hoist(userland, "getServerSideProps")
      export const config = hoist(userland, "config")
      export const reportWebVitals = hoist(userland, "reportWebVitals")
      ${
        // When we're building the instrumentation page (only when the
        // instrumentation file conflicts with a page also labeled
        // /instrumentation) hoist the `register` method.
        isInstrumentationHookFile(page)
          ? 'export const register = hoist(userland, "register")'
          : ''
      }

      // Re-export legacy methods.
      export const unstable_getStaticProps = hoist(userland, "unstable_getStaticProps")
      export const unstable_getStaticPaths = hoist(userland, "unstable_getStaticPaths")
      export const unstable_getStaticParams = hoist(userland, "unstable_getStaticParams")
      export const unstable_getServerProps = hoist(userland, "unstable_getServerProps")
      export const unstable_getServerSideProps = hoist(userland, "unstable_getServerSideProps")

      // Create and export the route module that will be consumed.
      const options = ${JSON.stringify(options)}
      const routeModule = new RouteModule({
        ...options,
        components: {
          App: moduleApp.default,
          Document: moduleDocument.default,
        },
        userland,
      })
      
      export { routeModule }
  `
}

const loadPagesAPI = (opts: RouteLoaderPagesAPIOptions) => {
  const { page, absolutePagePath } = opts

  const options: Omit<PagesAPIRouteModuleOptions, 'userland' | 'components'> = {
    definition: {
      kind: RouteKind.PAGES_API,
      page: normalizePagePath(page),
      pathname: page,
      // The following aren't used in production.
      bundlePath: '',
      filename: '',
    },
  }

  return `
      // Next.js Route Loader
      import RouteModule from "next/dist/server/future/route-modules/pages-api/module"
      import { hoist } from "next/dist/build/webpack/loaders/next-route-loader/helpers"

      // Import the userland code.
      import * as userland from ${JSON.stringify(absolutePagePath)}

      // Re-export the handler (should be the default export).
      export default hoist(userland, "default")

      // Re-export config.
      export const config = hoist(userland, "config")

      // Create and export the route module that will be consumed.
      const options = ${JSON.stringify(options)}
      const routeModule = new RouteModule({
        ...options,
        userland,
      })
      
      export { routeModule }
  `
}

/**
 * Handles the `next-route-loader` options.
 * @returns the loader definition function
 */
const loader: webpack.LoaderDefinitionFunction<RouteLoaderOptions> =
  function () {
    const opts = this.getOptions()

    switch (opts.kind) {
      case RouteKind.PAGES: {
        if (!this._module) {
          throw new Error('Invariant: expected this to reference a module')
        }

        return loadPages(opts, getModuleBuildInfo(this._module))
      }
      case RouteKind.PAGES_API: {
        return loadPagesAPI(opts)
      }
      default: {
        throw new Error('Invariant: Unexpected route kind')
      }
    }
  }

export default loader
