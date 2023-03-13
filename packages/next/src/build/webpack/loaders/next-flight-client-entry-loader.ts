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

export default async function transformSource(this: any): Promise<string> {
  let { modules, server }: NextFlightClientEntryLoaderOptions =
    this.getOptions()
  const isServer = server === 'true'

  if (!Array.isArray(modules)) {
    modules = modules ? [modules] : []
  }

  const requests = modules as string[]
  const code = requests
    // Filter out css files on the server
    .filter((request) => (isServer ? !regexCSS.test(request) : true))
    .map((request) =>
      regexCSS.test(request)
        ? `(() => import(/* webpackMode: "lazy" */ ${JSON.stringify(request)}))`
        : `import(/* webpackMode: "eager" */ ${JSON.stringify(request)})`
    )
    .join(';\n')

  const buildInfo = getModuleBuildInfo(this._module)
  const resolve = this.getResolve()

  // Resolve to absolute resource url for flight manifest to collect and use to determine client components
  const resolvedRequests = await Promise.all(
    requests.map(async (r) => await resolve(this.rootContext, r))
  )

  buildInfo.rsc = {
    type: RSC_MODULE_TYPES.client,
    requests: resolvedRequests,
  }

  return code
}
