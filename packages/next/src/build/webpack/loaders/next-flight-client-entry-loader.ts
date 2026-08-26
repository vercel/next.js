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
  /** Modules from dynamic import boundaries — imported lazily for code splitting */
  dynamicModules?: string[] | string
  /** This is transmitted as a string to `getOptions` */
  server: boolean | 'true' | 'false'
}

export type FlightClientEntryModuleItem = {
  // module path
  request: string
  // imported identifiers
  ids: string[]
}

function generateImportCode(
  item: FlightClientEntryModuleItem,
  eager: boolean
): string {
  const importPath = JSON.stringify(
    item.request.startsWith(BARREL_OPTIMIZATION_PREFIX)
      ? item.request.replace(':', '!=!')
      : item.request
  )

  if (eager) {
    // Eager mode: include in the current chunk (no code splitting)
    if (item.ids.length === 0 || item.ids.includes('*')) {
      return `import(/* webpackMode: "eager" */ ${importPath});\n`
    } else {
      return `import(/* webpackMode: "eager", webpackExports: ${JSON.stringify(
        item.ids
      )} */ ${importPath});\n`
    }
  } else {
    // Lazy mode: webpack creates a separate async chunk for this module,
    // enabling per-component code splitting for client components reached
    // through dynamic server component imports.
    if (item.ids.length === 0 || item.ids.includes('*')) {
      return `import(${importPath});\n`
    } else {
      return `import(/* webpackExports: ${JSON.stringify(
        item.ids
      )} */ ${importPath});\n`
    }
  }
}

export default function transformSource(
  this: webpack.LoaderContext<NextFlightClientEntryLoaderOptions>
) {
  let { modules, dynamicModules, server } = this.getOptions()
  const isServer = server === 'true'

  if (!Array.isArray(modules)) {
    modules = modules ? [modules] : []
  }
  if (!Array.isArray(dynamicModules)) {
    dynamicModules = dynamicModules ? [dynamicModules] : []
  }

  // Eager imports: client components reachable through static imports only
  const eagerCode = modules
    .map((x) => JSON.parse(x) as FlightClientEntryModuleItem)
    .filter(({ request }) => (isServer ? !regexCSS.test(request) : true))
    .map((item) => generateImportCode(item, true))
    .join(';\n')

  // Lazy imports: client components reachable through dynamic import boundaries
  // in the server component tree. Only for browser compilation — SSR gets all
  // modules as eager via the `modules` param (they're merged there).
  const lazyCode = isServer
    ? ''
    : dynamicModules
        .map((x) => JSON.parse(x) as FlightClientEntryModuleItem)
        .filter(({ request }) => !regexCSS.test(request))
        .map((item) => generateImportCode(item, false))
        .join(';\n')

  const code = eagerCode + lazyCode

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
