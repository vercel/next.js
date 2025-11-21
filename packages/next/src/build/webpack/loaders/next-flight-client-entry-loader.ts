import type { webpack } from 'next/dist/compiled/webpack/webpack'
import {
  BARREL_OPTIMIZATION_PREFIX,
  RSC_MODULE_TYPES,
} from '../../../shared/lib/constants'
import { getModuleBuildInfo } from './get-module-build-info'
import { regexCSS } from './utils'

/**
 * { [client import path]: [exported names] }
 */
export type ClientComponentImports = Record<string, Set<string>>
export type CssImports = Record<string, string[]>

export type NextFlightClientEntryLoaderOptions = {
  modules: string[] | string
  /** This is transmitted as a string to `getOptions` */
  server: boolean | 'true' | 'false'
}

export type FlightClientEntryModuleItem = {
  // module path
  request: string
  // imported identifiers
  ids: string[]
}

export default function transformSource(
  this: webpack.LoaderContext<NextFlightClientEntryLoaderOptions>
) {
  let { modules, server } = this.getOptions()
  const isServer = server === 'true'

  if (!Array.isArray(modules)) {
    modules = modules ? [modules] : []
  }

  const code = modules
    .map((x) => JSON.parse(x) as FlightClientEntryModuleItem)
    // Filter out CSS files in the SSR compilation
    .filter(({ request }) => (isServer ? !regexCSS.test(request) : true))
    .map(({ request, ids }: FlightClientEntryModuleItem) => {
      const importPath = JSON.stringify(
        request.startsWith(BARREL_OPTIMIZATION_PREFIX)
          ? request.replace(':', '!=!')
          : request
      )

      // When we cannot determine the export names, we use eager mode to include the whole module.
      // Otherwise, we use eager mode with webpackExports to only include the necessary exports.
      // If we have '*' in the ids, we include all the imports
      if (ids.length === 0 || ids.includes('*')) {
        return `import(/* webpackMode: "eager" */ ${importPath});\n`
      } else {
        return `import(/* webpackMode: "eager", webpackExports: ${JSON.stringify(
          ids
        )} */ ${importPath});\n`
      }
    })
    .join(';\n')

  const buildInfo = getModuleBuildInfo(this._module!)

  buildInfo.rsc = {
    type: RSC_MODULE_TYPES.client,
  }
  if (process.env.BUILTIN_FLIGHT_CLIENT_ENTRY_PLUGIN) {
    const rscModuleInformationJson = JSON.stringify(buildInfo.rsc)
    return (
      `/* __rspack_internal_rsc_module_information_do_not_use__ ${rscModuleInformationJson} */\n` +
      code
    )
  }

  return code
}
