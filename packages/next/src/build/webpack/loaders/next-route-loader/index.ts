import type { webpack } from 'next/dist/compiled/webpack/webpack'

import { stringify } from 'querystring'
import { getModuleBuildInfo } from '../get-module-build-info'
import { PagesRouteModuleOptions } from '../../../../server/future/route-modules/pages/module'
import { RouteKind } from '../../../../server/future/route-kind'
import { normalizePagePath } from '../../../../shared/lib/page-path/normalize-page-path'
import { MiddlewareConfig } from '../../../analysis/get-page-static-info'

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

  middlewareConfig: string
}

/**
 * Returns the loader entry for a given page.
 *
 * @param query the options to create the loader entry
 * @returns the encoded loader entry
 */
export function getRouteLoaderEntry(query: RouteLoaderOptions): string {
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
      middlewareConfig: middlewareConfigBase64,
    } = this.getOptions()

    // Ensure we only run this loader for as a module.
    if (!this._module) {
      throw new Error('Invariant: expected this to reference a module')
    }

    const middlewareConfig: MiddlewareConfig = JSON.parse(
      Buffer.from(middlewareConfigBase64, 'base64').toString()
    )

    // Attach build info to the module.
    const buildInfo = getModuleBuildInfo(this._module)
    buildInfo.route = {
      page,
      absolutePagePath,
      preferredRegion,
      middlewareConfig,
    }

    const options: Omit<PagesRouteModuleOptions, 'userland'> = {
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

        // Re-export legacy methods.
        export const unstable_getStaticProps = hoist(userland, "unstable_getStaticProps")
        export const unstable_getStaticPaths = hoist(userland, "unstable_getStaticPaths")
        export const unstable_getStaticParams = hoist(userland, "unstable_getStaticParams")
        export const unstable_getServerProps = hoist(userland, "unstable_getServerProps")
        export const unstable_getServerSideProps = hoist(userland, "unstable_getServerSideProps")

        // Create and export the route module that will be consumed.
        const options = ${JSON.stringify(options)}
        const routeModule = new RouteModule({ ...options, userland })
        
        export { routeModule }
    `
  }

export default loader
