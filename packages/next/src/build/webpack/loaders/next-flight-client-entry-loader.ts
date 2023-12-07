import {
  BARREL_OPTIMIZATION_PREFIX,
  RSC_MODULE_TYPES,
} from '../../../shared/lib/constants'
import { getModuleBuildInfo } from './get-module-build-info'
import { regexCSS } from './utils'

export type ClientComponentImports = string[]
export type CssImports = Record<string, string[]>

export type NextFlightClientEntryLoaderOptions = {
  modules: ClientComponentImports
  /** This is transmitted as a string to `getOptions` */
  server: boolean | 'true' | 'false'
}

export default function transformSource(this: any) {
  let { modules, server }: NextFlightClientEntryLoaderOptions =
    this.getOptions()
  const isServer = server === 'true'

  if (!Array.isArray(modules)) {
    modules = modules ? [modules] : []
  }

  const requests = modules as string[]
  const code = requests
    // Filter out CSS files in the SSR compilation
    .filter((request) => (isServer ? !regexCSS.test(request) : true))
    .map(
      (request) =>
        `import(/* webpackMode: "eager" */ ${JSON.stringify(
          request.startsWith(BARREL_OPTIMIZATION_PREFIX)
            ? request.replace(':', '!=!')
            : request
        )})`
    )
    .join(';\n')

  const buildInfo = getModuleBuildInfo(this._module)

  buildInfo.rsc = {
    type: RSC_MODULE_TYPES.client,
  }

  return code
}
