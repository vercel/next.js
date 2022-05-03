import { webpack5 } from 'next/dist/compiled/webpack/webpack'

/**
 * A getter for module build info that casts to the type it should have.
 * We also expose here types to make easier to use it.
 */
export function getModuleBuildInfo(webpackModule: webpack5.Module) {
  return webpackModule.buildInfo as {
    nextEdgeMiddleware?: EdgeMiddlewareMeta
    nextEdgeSSR?: EdgeSSRMeta
    nextUsedEnvVars?: Set<string>
    nextWasmMiddlewareBinding?: WasmBinding
    usingIndirectEval?: boolean | Set<string>
  }
}

export interface EdgeMiddlewareMeta {
  page: string
}

export interface EdgeSSRMeta {
  isServerComponent: boolean
  page: string
}

export interface WasmBinding {
  filePath: string
  name: string
}
