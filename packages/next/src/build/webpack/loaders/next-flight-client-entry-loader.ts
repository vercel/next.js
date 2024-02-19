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

export default function transformSource(
  this: webpack.LoaderContext<NextFlightClientEntryLoaderOptions>
) {
  let { modules, server } = this.getOptions()
  const isServer = server === 'true'

  if (!Array.isArray(modules)) {
    modules = modules ? [modules] : []
  }

  const mods = modules || []
  const code = mods
    .map((x) => JSON.parse(x))
    // Filter out CSS files in the SSR compilation
    .filter(([request]) => (isServer ? !regexCSS.test(request) : true))
    .map(([request, ...importedIdentifiers]) => {
      const importPath = JSON.stringify(
        request.startsWith(BARREL_OPTIMIZATION_PREFIX)
          ? request.replace(':', '!=!')
          : request
      )
      if (importedIdentifiers.includes('*')) {
        return `import(/* webpackMode: "eager" */ ${importPath})`
      } else {
        return `import(/* webpackMode: "eager" */ /* webpackExports: ${JSON.stringify(
          importedIdentifiers
        )} */ ${importPath})`
      }
    })
    .join(';\n')

  const buildInfo = getModuleBuildInfo(this._module!)

  buildInfo.rsc = {
    type: RSC_MODULE_TYPES.client,
  }

  return code
}
