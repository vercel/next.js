import { RSC_MODULE_TYPES } from '../../../shared/lib/constants'
import { getModuleBuildInfo } from './get-module-build-info'
import { regexCSS } from './utils'

export type ClientComponentImports = Record<string, string[]>
export type CssImports = Record<string, string[]>

export type NextFlightClientEntryLoaderOptions = {
  modules: string
  /** This is transmitted as a string to `getOptions` */
  server: boolean | 'true' | 'false'
}

export default function transformSource(this: any) {
  let { modules, server }: NextFlightClientEntryLoaderOptions =
    this.getOptions()
  const isServer = server === 'true'
  const clientImports = JSON.parse(modules) as [string, string[]][]

  const code = clientImports
    // Filter out CSS files in the SSR compilation
    .filter(([request]) => (isServer ? !regexCSS.test(request) : true))
    .map(([request, imports]) => {
      if (imports[0] === '*') {
        return `import(/* webpackMode: "eager" */ ${JSON.stringify(request)})`
      }

      return `import(/* webpackMode: "eager" *//* webpackExports: [${imports
        .map((i) => JSON.stringify(i))
        .join(', ')}] */ ${JSON.stringify(request)})`
    })
    .join(';\n')

  const buildInfo = getModuleBuildInfo(this._module)

  buildInfo.rsc = {
    type: RSC_MODULE_TYPES.client,
  }

  return code
}
