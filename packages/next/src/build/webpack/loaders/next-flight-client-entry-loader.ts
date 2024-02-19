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

  const code = modules
    .map((x) => JSON.parse(x))
    // Filter out CSS files in the SSR compilation
    .filter(({ importPath }) => (isServer ? !regexCSS.test(importPath) : true))
    .map(({ importPath, identifiers }) => {
      const decodedImportPath = JSON.stringify(
        importPath.startsWith(BARREL_OPTIMIZATION_PREFIX)
          ? importPath.replace(':', '!=!')
          : importPath
      )
      if (identifiers.includes('*')) {
        return `import(/* webpackMode: "eager" */ ${decodedImportPath})`
      } else {
        return `import(/* webpackMode: "eager" */ /* webpackExports: ${JSON.stringify(
          identifiers
        )} */ ${decodedImportPath})`
      }
    })
    .join(';\n')

  const buildInfo = getModuleBuildInfo(this._module!)

  buildInfo.rsc = {
    type: RSC_MODULE_TYPES.client,
  }

  return code
}
