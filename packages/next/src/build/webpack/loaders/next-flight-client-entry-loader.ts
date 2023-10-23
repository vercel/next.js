import { RSC_MODULE_TYPES } from '../../../shared/lib/constants'
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
  const { modules, server }: NextFlightClientEntryLoaderOptions =
    this.getOptions()

  const isServer = server === 'true'
  const code = modules
    // Filter out CSS files in the SSR compilation
    .filter((request) => (isServer ? !regexCSS.test(request) : true))
    .map(
      (request) =>
        `import(/* webpackMode: "eager" */ ${JSON.stringify(request)})`
    )
    .join(';\n')

  const buildInfo = getModuleBuildInfo(this._module)

  buildInfo.rsc = {
    type: RSC_MODULE_TYPES.client,
  }

  return code
}
