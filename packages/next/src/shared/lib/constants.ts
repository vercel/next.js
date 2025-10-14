import MODERN_BROWSERSLIST_TARGET from './modern-browserslist-target'

export { MODERN_BROWSERSLIST_TARGET }

export type ValueOf<T> = Required<T>[keyof T]

export const COMPILER_NAMES = {
  client: 'client',
  server: 'server',
  edgeServer: 'edge-server',
} as const

export type CompilerNameValues = ValueOf<typeof COMPILER_NAMES>

export const COMPILER_INDEXES: {
  [compilerKey in CompilerNameValues]: number
} = {
  [COMPILER_NAMES.client]: 0,
  [COMPILER_NAMES.server]: 1,
  [COMPILER_NAMES.edgeServer]: 2,
} as const

// Re-export entry constants for backward compatibility
export {
  UNDERSCORE_NOT_FOUND_ROUTE,
  UNDERSCORE_NOT_FOUND_ROUTE_ENTRY,
  UNDERSCORE_GLOBAL_ERROR_ROUTE,
  UNDERSCORE_GLOBAL_ERROR_ROUTE_ENTRY,
} from './entry-constants'

export enum AdapterOutputType {
  /**
   * `PAGES` represents all the React pages that are under `pages/`.
   */
  PAGES = 'PAGES',

  /**
   * `PAGES_API` represents all the API routes under `pages/api/`.
   */
  PAGES_API = 'PAGES_API',
  /**
   * `APP_PAGE` represents all the React pages that are under `app/` with the
   * filename of `page.{j,t}s{,x}`.
   */
  APP_PAGE = 'APP_PAGE',

  /**
   * `APP_ROUTE` represents all the API routes and metadata routes that are under `app/` with the
   * filename of `route.{j,t}s{,x}`.
   */
  APP_ROUTE = 'APP_ROUTE',

  /**
   * `PRERENDER` represents an ISR enabled route that might
   * have a seeded cache entry or fallback generated during build
   */
  PRERENDER = 'PRERENDER',

  /**
   * `STATIC_FILE` represents a static file (ie /_next/static)
   */
  STATIC_FILE = 'STATIC_FILE',

  /**
   * `MIDDLEWARE` represents the middleware output if present
   */
  MIDDLEWARE = 'MIDDLEWARE',
}

export const PHASE_EXPORT = 'phase-export'
export const PHASE_PRODUCTION_BUILD = 'phase-production-build'
export const PHASE_PRODUCTION_SERVER = 'phase-production-server'
export const PHASE_DEVELOPMENT_SERVER = 'phase-development-server'
export const PHASE_TEST = 'phase-test'
export const PHASE_INFO = 'phase-info'

export type PHASE_TYPE =
  | typeof PHASE_INFO
  | typeof PHASE_TEST
  | typeof PHASE_EXPORT
  | typeof PHASE_PRODUCTION_BUILD
  | typeof PHASE_PRODUCTION_SERVER
  | typeof PHASE_DEVELOPMENT_SERVER

export const PAGES_MANIFEST = 'pages-manifest.json'
export const WEBPACK_STATS = 'webpack-stats.json'
export const APP_PATHS_MANIFEST = 'app-paths-manifest.json'
export const APP_PATH_ROUTES_MANIFEST = 'app-path-routes-manifest.json'
export const BUILD_MANIFEST = 'build-manifest.json'
export const FUNCTIONS_CONFIG_MANIFEST = 'functions-config-manifest.json'
export const SUBRESOURCE_INTEGRITY_MANIFEST = 'subresource-integrity-manifest'
export const NEXT_FONT_MANIFEST = 'next-font-manifest'
export const EXPORT_MARKER = 'export-marker.json'
export const EXPORT_DETAIL = 'export-detail.json'
export const PRERENDER_MANIFEST = 'prerender-manifest.json'
export const ROUTES_MANIFEST = 'routes-manifest.json'
export const IMAGES_MANIFEST = 'images-manifest.json'
export const SERVER_FILES_MANIFEST = 'required-server-files.json'
export const DEV_CLIENT_PAGES_MANIFEST = '_devPagesManifest.json'
export const MIDDLEWARE_MANIFEST = 'middleware-manifest.json'
export const TURBOPACK_CLIENT_MIDDLEWARE_MANIFEST =
  '_clientMiddlewareManifest.json'
export const TURBOPACK_CLIENT_BUILD_MANIFEST = 'client-build-manifest.json'
export const DEV_CLIENT_MIDDLEWARE_MANIFEST = '_devMiddlewareManifest.json'
export const REACT_LOADABLE_MANIFEST = 'react-loadable-manifest.json'
export const SERVER_DIRECTORY = 'server'
export const CONFIG_FILES = [
  'next.config.js',
  'next.config.mjs',
  'next.config.ts',
  // process.features can be undefined on Edge runtime
  // TODO: Remove `as any` once we bump @types/node to v22.10.0+
  ...((process?.features as any)?.typescript ? ['next.config.mts'] : []),
]
export const BUILD_ID_FILE = 'BUILD_ID'
export const BLOCKED_PAGES = ['/_document', '/_app', '/_error']
export const CLIENT_PUBLIC_FILES_PATH = 'public'
export const CLIENT_STATIC_FILES_PATH = 'static'
export const STRING_LITERAL_DROP_BUNDLE = '__NEXT_DROP_CLIENT_FILE__'
export const NEXT_BUILTIN_DOCUMENT = '__NEXT_BUILTIN_DOCUMENT__'
export const BARREL_OPTIMIZATION_PREFIX = '__barrel_optimize__'

// server/[entry]/page_client-reference-manifest.js
export const CLIENT_REFERENCE_MANIFEST = 'client-reference-manifest'
// server/server-reference-manifest
export const SERVER_REFERENCE_MANIFEST = 'server-reference-manifest'
// server/middleware-build-manifest.js
export const MIDDLEWARE_BUILD_MANIFEST = 'middleware-build-manifest'
// server/middleware-react-loadable-manifest.js
export const MIDDLEWARE_REACT_LOADABLE_MANIFEST =
  'middleware-react-loadable-manifest'
// server/interception-route-rewrite-manifest.js
export const INTERCEPTION_ROUTE_REWRITE_MANIFEST =
  'interception-route-rewrite-manifest'
// server/dynamic-css-manifest.js
export const DYNAMIC_CSS_MANIFEST = 'dynamic-css-manifest'

// static/runtime/main.js
export const CLIENT_STATIC_FILES_RUNTIME_MAIN = `main`
export const CLIENT_STATIC_FILES_RUNTIME_MAIN_APP = `${CLIENT_STATIC_FILES_RUNTIME_MAIN}-app`
// next internal client components chunk for layouts
export const APP_CLIENT_INTERNALS = 'app-pages-internals'
// static/runtime/react-refresh.js
export const CLIENT_STATIC_FILES_RUNTIME_REACT_REFRESH = `react-refresh`
// static/runtime/webpack.js
export const CLIENT_STATIC_FILES_RUNTIME_WEBPACK = `webpack`
// static/runtime/polyfills.js
export const CLIENT_STATIC_FILES_RUNTIME_POLYFILLS = 'polyfills'
export const CLIENT_STATIC_FILES_RUNTIME_POLYFILLS_SYMBOL = Symbol(
  CLIENT_STATIC_FILES_RUNTIME_POLYFILLS
)
export const DEFAULT_RUNTIME_WEBPACK = 'webpack-runtime'
export const EDGE_RUNTIME_WEBPACK = 'edge-runtime-webpack'
export const STATIC_PROPS_ID = '__N_SSG'
export const SERVER_PROPS_ID = '__N_SSP'
export const DEFAULT_SERIF_FONT = {
  name: 'Times New Roman',
  xAvgCharWidth: 821,
  azAvgWidth: 854.3953488372093,
  unitsPerEm: 2048,
}
export const DEFAULT_SANS_SERIF_FONT = {
  name: 'Arial',
  xAvgCharWidth: 904,
  azAvgWidth: 934.5116279069767,
  unitsPerEm: 2048,
}
export const STATIC_STATUS_PAGES = ['/500']
export const TRACE_OUTPUT_VERSION = 1
// in `MB`
export const TURBO_TRACE_DEFAULT_MEMORY_LIMIT = 6000

export const RSC_MODULE_TYPES = {
  client: 'client',
  server: 'server',
} as const

// comparing
// https://nextjs.org/docs/api-reference/edge-runtime
// with
// https://nodejs.org/docs/latest/api/globals.html
export const EDGE_UNSUPPORTED_NODE_APIS = [
  'clearImmediate',
  'setImmediate',
  'BroadcastChannel',
  'ByteLengthQueuingStrategy',
  'CompressionStream',
  'CountQueuingStrategy',
  'DecompressionStream',
  'DomException',
  'MessageChannel',
  'MessageEvent',
  'MessagePort',
  'ReadableByteStreamController',
  'ReadableStreamBYOBRequest',
  'ReadableStreamDefaultController',
  'TransformStreamDefaultController',
  'WritableStreamDefaultController',
]

export const SYSTEM_ENTRYPOINTS = new Set<string>([
  CLIENT_STATIC_FILES_RUNTIME_MAIN,
  CLIENT_STATIC_FILES_RUNTIME_REACT_REFRESH,
  CLIENT_STATIC_FILES_RUNTIME_MAIN_APP,
])
