import type { webpack } from 'next/dist/compiled/webpack/webpack'

import { stringify } from 'querystring'
import { getModuleBuildInfo } from './get-module-build-info'

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
    const { page, preferredRegion, absolutePagePath } = this.getOptions()

    // Ensure we only run this loader for as a module.
    if (!this._module) {
      throw new Error('Invariant: expected this to reference a module')
    }

    // Attach build info to the module.
    const buildInfo = getModuleBuildInfo(this._module)
    buildInfo.route = {
      page,
      absolutePagePath,
      preferredRegion,
    }

    return `
        // Next.js Route Loader
        export * from ${JSON.stringify(absolutePagePath)}
        export { default } from ${JSON.stringify(absolutePagePath)}
    `
  }

export default loader
