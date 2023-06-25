import type { webpack } from 'next/dist/compiled/webpack/webpack'

import { stringify } from 'querystring'
import { getModuleBuildInfo } from '../get-module-build-info'
import { PagesRouteModuleOptions } from '../../../../server/future/route-modules/pages/module'
import { RouteKind } from '../../../../server/future/route-kind'
import { normalizePagePath } from '../../../../shared/lib/page-path/normalize-page-path'
import { MiddlewareConfig } from '../../../analysis/get-page-static-info'
import { decodeFromBase64, encodeToBase64 } from '../utils'
import { isInstrumentationHookFile } from '../../../worker'

type RouteLoaderOptionsInput = {
  page: string
  pages: { [page: string]: string }
  preferredRegion: string | string[] | undefined
  absolutePagePath: string
  middlewareConfig: MiddlewareConfig
}

/**
 * The options for the route loader.
 */
type RouteLoaderOptions = {
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
  absoluteAppPath: string
  absoluteDocumentPath: string
  middlewareConfigBase64: string
}

/**
 * Returns the loader entry for a given page.
 *
 * @param options the options to create the loader entry
 * @returns the encoded loader entry
 */
export function getRouteLoaderEntry(options: RouteLoaderOptionsInput): string {
  const query: RouteLoaderOptions = {
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

/**
 * Handles the `next-route-loader` options.
 * @returns the loader definition function
 */
const loader: webpack.LoaderDefinitionFunction<RouteLoaderOptions> =
  function () {
    const {
      page,
      preferredRegion,
      absolutePagePath,
      absoluteAppPath,
      absoluteDocumentPath,
      middlewareConfigBase64,
    } = this.getOptions()

    // Ensure we only run this loader for as a module.
    if (!this._module) {
      throw new Error('Invariant: expected this to reference a module')
    }

    const middlewareConfig: MiddlewareConfig = decodeFromBase64(
      middlewareConfigBase64
    )

    // Attach build info to the module.
    const buildInfo = getModuleBuildInfo(this._module)
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

export default loader
