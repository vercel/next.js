import type { webpack } from 'next/dist/compiled/webpack/webpack'

import { stringify } from 'querystring'

/**
 * The options for the route loader.
 */
type RouteLoaderOptions = {
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
    const { absolutePagePath } = this.getOptions()

    return `
        // Next.js Route Loader
        export * from ${JSON.stringify(absolutePagePath)}
        export { default } from ${JSON.stringify(absolutePagePath)}
    `
  }

export default loader
