import type { LoadComponentsReturnType } from '../load-components'
import type { ServerRuntime, SizeLimit } from '../../../types'
import { NextConfigComplete } from '../../server/config-shared'
import type { ClientReferenceManifest } from '../../build/webpack/plugins/flight-manifest-plugin'
import type { NextFontManifest } from '../../build/webpack/plugins/next-font-manifest-plugin'
import type { ParsedUrlQuery } from 'querystring'

import zod from 'zod'

export type DynamicParamTypes = 'catchall' | 'optional-catchall' | 'dynamic'

const dynamicParamTypesSchema = zod.enum(['c', 'oc', 'd'])
/**
 * c = catchall
 * oc = optional catchall
 * d = dynamic
 */
export type DynamicParamTypesShort = zod.infer<typeof dynamicParamTypesSchema>

const segmentSchema = zod.union([
  zod.string(),
  zod.tuple([zod.string(), zod.string(), dynamicParamTypesSchema]),
])
/**
 * Segment in the router state.
 */
export type Segment = zod.infer<typeof segmentSchema>

export const flightRouterStateSchema: zod.ZodType<FlightRouterState> = zod.lazy(
  () => {
    const parallelRoutesSchema = zod.record(flightRouterStateSchema)
    const urlSchema = zod.string().nullable().optional()
    const refreshSchema = zod.literal('refetch').nullable().optional()
    const isRootLayoutSchema = zod.boolean().optional()

    // Due to the lack of optional tuple types in Zod, we need to use union here.
    // https://github.com/colinhacks/zod/issues/1465
    return zod.union([
      zod.tuple([
        segmentSchema,
        parallelRoutesSchema,
        urlSchema,
        refreshSchema,
        isRootLayoutSchema,
      ]),
      zod.tuple([
        segmentSchema,
        parallelRoutesSchema,
        urlSchema,
        refreshSchema,
      ]),
      zod.tuple([segmentSchema, parallelRoutesSchema, urlSchema]),
      zod.tuple([segmentSchema, parallelRoutesSchema]),
    ])
  }
)
/**
 * Router state
 */
export type FlightRouterState = [
  segment: Segment,
  parallelRoutes: { [parallelRouterKey: string]: FlightRouterState },
  url?: string | null,
  refresh?: 'refetch' | null,
  isRootLayout?: boolean
]

/**
 * Individual Flight response path
 */
export type FlightSegmentPath =
  // Uses `any` as repeating pattern can't be typed.
  | any[]
  // Looks somewhat like this
  | [
      segment: Segment,
      parallelRouterKey: string,
      segment: Segment,
      parallelRouterKey: string,
      segment: Segment,
      parallelRouterKey: string
    ]

export type FlightDataPath =
  // Uses `any` as repeating pattern can't be typed.
  | any[]
  // Looks somewhat like this
  | [
      // Holds full path to the segment.
      ...FlightSegmentPath[],
      /* segment of the rendered slice: */ Segment,
      /* treePatch */ FlightRouterState,
      /* subTreeData: */ React.ReactNode | null, // Can be null during prefetch if there's no loading component
      /* head */ React.ReactNode | null
    ]

/**
 * The Flight response data
 */
export type FlightData = Array<FlightDataPath> | string

export type ActionResult = Promise<any>

// Response from `createFromFetch` for normal rendering
export type NextFlightResponse = [buildId: string, flightData: FlightData]

// Response from `createFromFetch` for server actions. Action's flight data can be null
export type ActionFlightResponse =
  | [ActionResult, [buildId: string, flightData: FlightData | null]]
  // This case happens when `redirect()` is called in a server action.
  | NextFlightResponse

/**
 * Property holding the current subTreeData.
 */
export type ChildProp = {
  /**
   * Null indicates that the tree is partial
   */
  current: React.ReactNode | null
  segment: Segment
}

export type RenderOptsPartial = {
  err?: Error | null
  dev?: boolean
  buildId: string
  basePath: string
  clientReferenceManifest?: ClientReferenceManifest
  supportsDynamicHTML: boolean
  runtime?: ServerRuntime
  serverComponents?: boolean
  assetPrefix?: string
  nextFontManifest?: NextFontManifest
  isBot?: boolean
  incrementalCache?: import('../lib/incremental-cache').IncrementalCache
  isRevalidate?: boolean
  nextExport?: boolean
  nextConfigOutput?: 'standalone' | 'export'
  appDirDevErrorLogger?: (err: any) => Promise<void>
  originalPathname?: string
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
  serverActionsBodySizeLimit?: SizeLimit
  params?: ParsedUrlQuery
}

export type RenderOpts = LoadComponentsReturnType & RenderOptsPartial
