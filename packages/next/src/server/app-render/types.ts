import type { LoadComponentsReturnType } from '../load-components'
import type { ServerRuntime, SizeLimit } from '../../types'
import type {
  ExperimentalConfig,
  NextConfigComplete,
} from '../../server/config-shared'
import type { ClientReferenceManifest } from '../../build/webpack/plugins/flight-manifest-plugin'
import type { NextFontManifest } from '../../build/webpack/plugins/next-font-manifest-plugin'
import type { ParsedUrlQuery } from 'querystring'
import type { AppPageModule } from '../route-modules/app-page/module'
import type { DeepReadonly } from '../../shared/lib/deep-readonly'
import type { ImageConfigComplete } from '../../shared/lib/image-config'
import type { __ApiPreviewProps } from '../api-utils'

import s from 'next/dist/compiled/superstruct'
import type { RequestLifecycleOpts } from '../base-server'
import type { InstrumentationOnRequestError } from '../instrumentation/types'
import type { NextRequestHint } from '../web/adapter'
import type { BaseNextRequest } from '../base-http'
import type { IncomingMessage } from 'http'
import type { RenderResumeDataCache } from '../resume-data-cache/resume-data-cache'
import type { ServerCacheStatus } from '../../next-devtools/dev-overlay/cache-indicator'

const dynamicParamTypesSchema = s.enums(['c', 'ci', 'oc', 'd', 'di'])

const segmentSchema = s.union([
  s.string(),

  s.tuple([
    // Param name
    s.string(),
    // Param cache key (almost the same as the value, but arrays are
    // concatenated into strings)
    // TODO: We should change this to just be the value. Currently we convert
    // it back to a value when passing to useParams. It only needs to be
    // a string when converted to a a cache key, but that doesn't mean we
    // need to store it as that representation.
    s.string(),
    // Dynamic param type
    dynamicParamTypesSchema,
  ]),
])

// unfortunately the tuple is not understood well by Describe so we have to
// use any here. This does not have any impact on the runtime type since the validation
// does work correctly.
export const flightRouterStateSchema: s.Describe<any> = s.tuple([
  segmentSchema,
  s.record(
    s.string(),
    s.lazy(() => flightRouterStateSchema)
  ),
  s.optional(s.nullable(s.string())),
  s.optional(
    s.nullable(
      s.union([
        s.literal('refetch'),
        s.literal('refresh'),
        s.literal('inside-shared-layout'),
        s.literal('metadata-only'),
      ])
    )
  ),
  s.optional(s.boolean()),
])

export type ServerOnInstrumentationRequestError = (
  error: unknown,
  // The request could be middleware, node server or web server request,
  // we normalized them into an aligned format to `onRequestError` API later.
  request: NextRequestHint | BaseNextRequest | IncomingMessage,
  errorContext: Parameters<InstrumentationOnRequestError>[2]
) => void | Promise<void>

export interface RenderOptsPartial {
  dir?: string
  previewProps: __ApiPreviewProps | undefined
  err?: Error | null
  dev?: boolean
  basePath: string
  cacheComponents: boolean
  trailingSlash: boolean
  images: ImageConfigComplete
  clientReferenceManifest?: DeepReadonly<ClientReferenceManifest>
  supportsDynamicResponse: boolean
  runtime?: ServerRuntime
  serverComponents?: boolean
  enableTainting?: boolean
  assetPrefix?: string
  crossOrigin?: '' | 'anonymous' | 'use-credentials' | undefined
  nextFontManifest?: DeepReadonly<NextFontManifest>
  botType?: 'dom' | 'html' | undefined
  serveStreamingMetadata?: boolean
  incrementalCache?: import('../lib/incremental-cache').IncrementalCache
  cacheLifeProfiles?: {
    [profile: string]: import('../use-cache/cache-life').CacheLife
  }
  isOnDemandRevalidate?: boolean
  isPossibleServerAction?: boolean
  setCacheStatus?: (
    status: ServerCacheStatus,
    htmlRequestId: string,
    requestId: string
  ) => void
  setIsrStatus?: (key: string, value: boolean | undefined) => void
  setReactDebugChannel?: (
    debugChannel: { readable: ReadableStream<Uint8Array> },
    htmlRequestId: string,
    requestId: string
  ) => void
  nextExport?: boolean
  nextConfigOutput?: 'standalone' | 'export'
  onInstrumentationRequestError?: ServerOnInstrumentationRequestError
  isDraftMode?: boolean
  deploymentId?: string
  onUpdateCookies?: (cookies: string[]) => void
  loadConfig?: (
    phase: string,
    dir: string,
    customConfig?: object | null,
    rawConfig?: boolean,
    silent?: boolean
  ) => Promise<NextConfigComplete>
  serverActions?: {
    bodySizeLimit?: SizeLimit
    allowedOrigins?: string[]
  }
  params?: ParsedUrlQuery
  isPrefetch?: boolean
  htmlLimitedBots: string | undefined
  experimental: {
    /**
     * When true, it indicates that the current page supports partial
     * prerendering.
     */
    isRoutePPREnabled?: boolean
    expireTime: number | undefined
    staleTimes: ExperimentalConfig['staleTimes'] | undefined
    clientTraceMetadata: string[] | undefined
    clientSegmentCache: boolean | 'client-only'

    /**
     * The origins that are allowed to write the rewritten headers when
     * performing a non-relative rewrite. When undefined, no non-relative
     * rewrites will get the rewrite headers.
     */
    clientParamParsingOrigins: string[] | undefined
    dynamicOnHover: boolean
    inlineCss: boolean
    authInterrupts: boolean
  }
  postponed?: string

  /**
   * Should wait for react stream allReady to resolve all suspense boundaries,
   * in order to perform a full page render.
   */
  shouldWaitOnAllReady?: boolean

  /**
   * A prefilled resume data cache. This was either generated for this page
   * during dev warmup, or when a page with defined params was previously
   * prerendered, and now its matching optional fallback shell is prerendered.
   */
  renderResumeDataCache?: RenderResumeDataCache

  /**
   * When true, the page will be rendered using the static rendering to detect
   * any dynamic API's that would have stopped the page from being fully
   * statically generated.
   */
  isDebugDynamicAccesses?: boolean

  /**
   * This is true when:
   * - source maps are generated
   * - source maps are applied
   * - minification is disabled
   */
  hasReadableErrorStacks?: boolean

  /**
   * The maximum length of the headers that are emitted by React and added to
   * the response.
   */
  reactMaxHeadersLength: number | undefined

  isStaticGeneration?: boolean

  /**
   * When true, the page is prerendered as a fallback shell, while allowing any
   * dynamic accesses to result in an empty shell. This is the case when there
   * are also routes prerendered with a more complete set of params.
   * Prerendering those routes would catch any invalid dynamic accesses.
   */
  allowEmptyStaticShell?: boolean
}

export type RenderOpts = LoadComponentsReturnType<AppPageModule> &
  RenderOptsPartial &
  RequestLifecycleOpts

export type PreloadCallbacks = (() => void)[]
