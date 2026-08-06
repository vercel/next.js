import type { ServerRuntime } from '../types'

export const TEXT_PLAIN_CONTENT_TYPE_HEADER = 'text/plain'
export const HTML_CONTENT_TYPE_HEADER = 'text/html; charset=utf-8'
export const JSON_CONTENT_TYPE_HEADER = 'application/json; charset=utf-8'
export const NEXT_QUERY_PARAM_PREFIX = 'nxtP'
export const NEXT_INTERCEPTION_MARKER_PREFIX = 'nxtI'
/**
 * Carries the variant combination a request resolved to, as a capture group in
 * the routing rules the build emits and therefore as a cache key input for a
 * CDN that keys on them.
 *
 * Deliberately not `nxtP`-prefixed: that prefix means "route param", and
 * `normalizeNextQueryParam` would turn this into a param named `variants`. This
 * names no param, only the combination.
 *
 * It is also how the combination reaches the origin, which recovers the values
 * it stands for from the build's own record of it. That makes this the one
 * channel a request rebuilt from an artifact still arrives on, since such a
 * request carries no headers of ours. The route module removes it from the
 * query once read, so it never reaches a page's `searchParams`.
 */
export const NEXT_VARIANTS_QUERY_PARAM = 'nxtV'

export const MATCHED_PATH_HEADER = 'x-matched-path'
export const PRERENDER_REVALIDATE_HEADER = 'x-prerender-revalidate'
export const PRERENDER_REVALIDATE_ONLY_GENERATED_HEADER =
  'x-prerender-revalidate-if-generated'

export const RSC_SEGMENTS_DIR_SUFFIX = '.segments'
export const RSC_SEGMENT_SUFFIX = '.segment.rsc'
export const RSC_SUFFIX = '.rsc'
export const ACTION_SUFFIX = '.action'
export const NEXT_DATA_SUFFIX = '.json'
export const NEXT_META_SUFFIX = '.meta'
export const NEXT_BODY_SUFFIX = '.body'

/**
 * Marker segment introducing a variant combination's hash in an internal
 * pathname, e.g. `/__variants/1u0zqp3/blog/my-post`. Produced by the edge
 * adapter and stripped again before route resolution; never user-visible.
 */
export const VARIANTS_PATH_PREFIX = '__variants'

/**
 * Carries the resolved variant values, encoded, so that the path only has to
 * carry a hash of them. A hash cannot be read back, and a render needs the
 * values: this is what lets a combination nobody enumerated still render.
 *
 * It takes two hops under one name, because it is one value with one meaning.
 * The proxy wrapper sets it on its response, and the edge adapter re-emits it
 * as a request header override on the way to the origin. The adapter is also
 * where the hash enters the path, and it has to be the adapter rather than the
 * wrapper: the client-facing rewrite headers are computed from the undecorated
 * destination, so decorating any earlier would show the client a rewrite to a
 * different route structure and stop it using the route for prediction.
 *
 * The `x-next-internal-` prefix is what makes this safe to trust on arrival.
 * Headers carrying it are reserved for the deployment's own routing layer:
 * whatever sits in front of the origin is expected to strip them from incoming
 * client requests before routing, so that a client cannot present itself as
 * having resolved a variant. `filterInternalHeaders` does the same when
 * self-hosting. Forwarding it onward is opt-in, which is what listing it in a
 * route's `allowHeader` asks for.
 */
export const NEXT_VARIANTS_HEADER = 'x-next-internal-variants'

/**
 * Asserts that the variants prefix on this request's path was written by the
 * proxy rather than supplied by whoever made the request.
 *
 * A prefixed path is where the prerender for one combination lives, and an
 * artifact's path is reachable whether or not any route names it, so the prefix
 * cannot simply be treated as internal. Without this, a client could name a
 * combination and be served it, which for a variant the server decides is the
 * thing the variant exists to prevent, and a combination nobody declared would
 * invent a cache entry for every value it was given. Knowing a valid hash does
 * not help, because the assertion is about who routed the request rather than
 * about the hash being secret.
 *
 * Trustworthy on arrival for the same reason `NEXT_VARIANTS_HEADER` is: the
 * `x-next-internal-` prefix is reserved for the deployment's own routing layer
 * and stripped from incoming client requests before routing sees them.
 *
 * Separate from `NEXT_VARIANTS_HEADER` because that one is absent exactly when
 * a combination matched and covered every variant its route reads, which is the
 * case this most needs to admit.
 */
export const NEXT_VARIANTS_PREFIX_HEADER = 'x-next-internal-variants-prefix'

export const NEXT_NAV_DEPLOYMENT_ID_HEADER = 'x-nextjs-deployment-id'

export const NEXT_CACHE_TAGS_HEADER = 'x-next-cache-tags'
export const NEXT_CACHE_REVALIDATED_TAGS_HEADER = 'x-next-revalidated-tags'
export const NEXT_CACHE_REVALIDATE_TAG_TOKEN_HEADER =
  'x-next-revalidate-tag-token'

export const NEXT_RESUME_HEADER = 'next-resume'
export const NEXT_RESUME_STATE_LENGTH_HEADER = 'x-next-resume-state-length'

// if these change make sure we update the related
// documentation as well
export const NEXT_CACHE_TAG_MAX_ITEMS = 128
export const NEXT_CACHE_TAG_MAX_LENGTH = 256
export const NEXT_CACHE_SOFT_TAG_MAX_LENGTH = 1024
export const NEXT_CACHE_IMPLICIT_TAG_ID = '_N_T_'
export const NEXT_CACHE_ROOT_PARAM_TAG_ID = '_N_RP_'

// in seconds
export const CACHE_ONE_YEAR_SECONDS = 31536000

// in seconds, represents revalidate=false. I.e. never revaliate.
// We use this value since it can be represented as a V8 SMI for optimal performance.
// It can also be serialized as JSON if it ever leaks accidentally as an actual value.
export const INFINITE_CACHE = 0xfffffffe

// Patterns to detect middleware files
export const MIDDLEWARE_FILENAME = 'middleware'
export const MIDDLEWARE_LOCATION_REGEXP = `(?:src/)?${MIDDLEWARE_FILENAME}`

// Patterns to detect proxy files (replacement for middleware)
export const PROXY_FILENAME = 'proxy'
export const PROXY_LOCATION_REGEXP = `(?:src/)?${PROXY_FILENAME}`

// Pattern to detect instrumentation hooks file
export const INSTRUMENTATION_HOOK_FILENAME = 'instrumentation'

// Because on Windows absolute paths in the generated code can break because of numbers, eg 1 in the path,
// we have to use a private alias
export const PAGES_DIR_ALIAS = 'private-next-pages'
export const DOT_NEXT_ALIAS = 'private-dot-next'
export const ROOT_DIR_ALIAS = 'private-next-root-dir'
export const APP_DIR_ALIAS = 'private-next-app-dir'
export const RSC_MOD_REF_PROXY_ALIAS = 'private-next-rsc-mod-ref-proxy'
export const RSC_ACTION_VALIDATE_ALIAS = 'private-next-rsc-action-validate'
export const RSC_ACTION_PROXY_ALIAS = 'private-next-rsc-server-reference'
export const RSC_CACHE_WRAPPER_ALIAS = 'private-next-rsc-cache-wrapper'
export const RSC_DYNAMIC_IMPORT_WRAPPER_ALIAS =
  'private-next-rsc-track-dynamic-import'
export const RSC_ACTION_ENCRYPTION_ALIAS = 'private-next-rsc-action-encryption'
export const RSC_ACTION_CLIENT_WRAPPER_ALIAS =
  'private-next-rsc-action-client-wrapper'

export const PUBLIC_DIR_MIDDLEWARE_CONFLICT = `You can not have a '_next' folder inside of your public folder. This conflicts with the internal '/_next' route. https://nextjs.org/docs/messages/public-next-folder-conflict`

export const SSG_GET_INITIAL_PROPS_CONFLICT = `You can not use getInitialProps with getStaticProps. To use SSG, please remove your getInitialProps`

export const SERVER_PROPS_GET_INIT_PROPS_CONFLICT = `You can not use getInitialProps with getServerSideProps. Please remove getInitialProps.`

export const SERVER_PROPS_SSG_CONFLICT = `You can not use getStaticProps or getStaticPaths with getServerSideProps. To use SSG, please remove getServerSideProps`

export const STATIC_STATUS_PAGE_GET_INITIAL_PROPS_ERROR = `can not have getInitialProps/getServerSideProps, https://nextjs.org/docs/messages/404-get-initial-props`

export const SERVER_PROPS_EXPORT_ERROR = `pages with \`getServerSideProps\` can not be exported. See more info here: https://nextjs.org/docs/messages/gssp-export`

export const GSP_NO_RETURNED_VALUE =
  'Your `getStaticProps` function did not return an object. Did you forget to add a `return`?'
export const GSSP_NO_RETURNED_VALUE =
  'Your `getServerSideProps` function did not return an object. Did you forget to add a `return`?'

export const UNSTABLE_REVALIDATE_RENAME_ERROR =
  'The `unstable_revalidate` property is available for general use.\n' +
  'Please use `revalidate` instead.'

export const GSSP_COMPONENT_MEMBER_ERROR = `can not be attached to a page's component and must be exported from the page. See more info here: https://nextjs.org/docs/messages/gssp-component-member`

export const NON_STANDARD_NODE_ENV = `You are using a non-standard "NODE_ENV" value in your environment. This creates inconsistencies in the project and is strongly advised against. Read more: https://nextjs.org/docs/messages/non-standard-node-env`

export const SSG_FALLBACK_EXPORT_ERROR = `Pages with \`fallback\` enabled in \`getStaticPaths\` can not be exported. See more info here: https://nextjs.org/docs/messages/ssg-fallback-true-export`

export const ESLINT_DEFAULT_DIRS = ['app', 'pages', 'components', 'lib', 'src']

export const SERVER_RUNTIME: Record<string, ServerRuntime> = {
  edge: 'edge',
  experimentalEdge: 'experimental-edge',
  nodejs: 'nodejs',
}

export const WEB_SOCKET_MAX_RECONNECTIONS = 12

/**
 * The names of the webpack layers. These layers are the primitives for the
 * webpack chunks.
 */
const WEBPACK_LAYERS_NAMES = {
  /**
   * The layer for the shared code between the client and server bundles.
   */
  shared: 'shared',
  /**
   * The layer for server-only runtime and picking up `react-server` export conditions.
   * Including app router RSC pages and app router custom routes and metadata routes.
   */
  reactServerComponents: 'rsc',
  /**
   * Server Side Rendering layer for app (ssr).
   */
  serverSideRendering: 'ssr',
  /**
   * The browser client bundle layer for actions.
   */
  actionBrowser: 'action-browser',
  /**
   * The Node.js bundle layer for the API routes.
   */
  apiNode: 'api-node',
  /**
   * The Edge Lite bundle layer for the API routes.
   */
  apiEdge: 'api-edge',
  /**
   * The layer for the middleware code.
   */
  middleware: 'middleware',
  /**
   * The layer for the instrumentation hooks.
   */
  instrument: 'instrument',
  /**
   * The layer for assets on the edge.
   */
  edgeAsset: 'edge-asset',
  /**
   * The browser client bundle layer for App directory.
   */
  appPagesBrowser: 'app-pages-browser',
  /**
   * The browser client bundle layer for Pages directory.
   */
  pagesDirBrowser: 'pages-dir-browser',
  /**
   * The Edge Lite bundle layer for Pages directory.
   */
  pagesDirEdge: 'pages-dir-edge',
  /**
   * The Node.js bundle layer for Pages directory.
   */
  pagesDirNode: 'pages-dir-node',
} as const

export type WebpackLayerName =
  (typeof WEBPACK_LAYERS_NAMES)[keyof typeof WEBPACK_LAYERS_NAMES]

const WEBPACK_LAYERS = {
  ...WEBPACK_LAYERS_NAMES,
  GROUP: {
    builtinReact: [
      WEBPACK_LAYERS_NAMES.reactServerComponents,
      WEBPACK_LAYERS_NAMES.actionBrowser,
    ],
    serverOnly: [
      WEBPACK_LAYERS_NAMES.reactServerComponents,
      WEBPACK_LAYERS_NAMES.actionBrowser,
      WEBPACK_LAYERS_NAMES.instrument,
      WEBPACK_LAYERS_NAMES.middleware,
    ],
    neutralTarget: [
      // pages api
      WEBPACK_LAYERS_NAMES.apiNode,
      WEBPACK_LAYERS_NAMES.apiEdge,
    ],
    clientOnly: [
      WEBPACK_LAYERS_NAMES.serverSideRendering,
      WEBPACK_LAYERS_NAMES.appPagesBrowser,
    ],
    bundled: [
      WEBPACK_LAYERS_NAMES.reactServerComponents,
      WEBPACK_LAYERS_NAMES.actionBrowser,
      WEBPACK_LAYERS_NAMES.serverSideRendering,
      WEBPACK_LAYERS_NAMES.appPagesBrowser,
      WEBPACK_LAYERS_NAMES.shared,
      WEBPACK_LAYERS_NAMES.instrument,
      WEBPACK_LAYERS_NAMES.middleware,
    ],
    appPages: [
      // app router pages and layouts
      WEBPACK_LAYERS_NAMES.reactServerComponents,
      WEBPACK_LAYERS_NAMES.serverSideRendering,
      WEBPACK_LAYERS_NAMES.appPagesBrowser,
      WEBPACK_LAYERS_NAMES.actionBrowser,
    ],
  },
}

const WEBPACK_RESOURCE_QUERIES = {
  edgeSSREntry: '__next_edge_ssr_entry__',
  metadata: '__next_metadata__',
  metadataRoute: '__next_metadata_route__',
  metadataImageMeta: '__next_metadata_image_meta__',
}

export { WEBPACK_LAYERS, WEBPACK_RESOURCE_QUERIES }
