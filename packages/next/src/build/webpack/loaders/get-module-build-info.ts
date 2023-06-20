import type {
  MiddlewareConfig,
  MiddlewareMatcher,
  RSCModuleType,
} from '../../analysis/get-page-static-info'
import { webpack } from 'next/dist/compiled/webpack/webpack'

export function extractCjsExports(source: string) {
  // In case the client entry is a CJS module, we need to parse all the exports
  // to make sure that the flight manifest plugin can correctly generate the
  // manifest.
  // TODO: Currently SWC wraps CJS exports with `_export(exports, { ... })`,
  // which is tricky to statically analyze. But since the shape is known, we
  // use a regex to extract the exports as a workaround. See:
  // https://github.com/swc-project/swc/blob/5629e6b5291b416c8316587b67b5e83d011a8c22/crates/swc_ecma_transforms_module/src/util.rs#L295

  const matchExportObject = source.match(
    /(?<=_export\(exports, {)(.*?)(?=}\);)/gs
  )

  if (matchExportObject) {
    // Match the property name with format <property>: function() ...
    return matchExportObject[0].match(/\b\w+(?=:)/g)
  }
  return null
}

/**
 * A getter for module build info that casts to the type it should have.
 * We also expose here types to make easier to use it.
 */
export function getModuleBuildInfo(webpackModule: webpack.Module) {
  return webpackModule.buildInfo as {
    nextEdgeMiddleware?: EdgeMiddlewareMeta
    nextEdgeApiFunction?: EdgeMiddlewareMeta
    nextEdgeSSR?: EdgeSSRMeta
    nextWasmMiddlewareBinding?: AssetBinding
    nextAssetMiddlewareBinding?: AssetBinding
    usingIndirectEval?: boolean | Set<string>
    route?: RouteMeta
    importLocByPath?: Map<string, any>
    rootDir?: string
    rsc?: RSCMeta
  }
}

export interface RSCMeta {
  type: RSCModuleType
  actions?: string[]
  clientRefs?: string[]
  clientEntryType?: 'cjs' | 'auto'
  isClientRef?: boolean
}

export interface RouteMeta {
  page: string
  absolutePagePath: string
  preferredRegion: string | string[] | undefined
  middlewareConfig: MiddlewareConfig
}

export interface EdgeMiddlewareMeta {
  page: string
  matchers?: MiddlewareMatcher[]
}

export interface EdgeSSRMeta {
  isServerComponent: boolean
  isAppDir?: boolean
  page: string
}

export interface AssetBinding {
  filePath: string
  name: string
}
