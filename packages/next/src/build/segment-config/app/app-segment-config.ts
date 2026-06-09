import { z } from 'next/dist/compiled/zod'
import { formatZodError } from '../../../shared/lib/zod'

const CookieSchema = z
  .object({
    name: z.string(),
    value: z.string().or(z.null()),
  })
  .strict()

const RuntimeSampleSchema = z
  .object({
    cookies: z.array(CookieSchema).optional(),
    headers: z.array(z.tuple([z.string(), z.string().or(z.null())])).optional(),
    params: z.record(z.union([z.string(), z.array(z.string())])).optional(),
    searchParams: z
      .record(z.union([z.string(), z.array(z.string()), z.null()]))
      .optional(),
  })
  .strict()

const InstantConfigObjectSchema = z
  .object({
    level: z.enum(['warning', 'experimental-error']).optional(),
    unstable_samples: z.array(RuntimeSampleSchema).min(1).optional(),
    unstable_from: z.array(z.string()).optional(),
    unstable_disableValidation: z.literal(true).optional(),
    unstable_disableDevValidation: z.literal(true).optional(),
    unstable_disableBuildValidation: z.literal(true).optional(),
  })
  .strict()

const InstantConfigSchema = z.union([
  InstantConfigObjectSchema,
  z.literal(true),
  z.literal(false),
])

const PrefetchSchema = z.enum([
  'auto',
  'partial',
  'unstable_eager',
  'force-disabled',
  'allow-runtime',
])

export type Instant = InstantConfig | true | false

export type Prefetch =
  | 'auto'
  | 'partial'
  | 'unstable_eager'
  | 'force-disabled'
  | 'allow-runtime'

export type InstantConfigForTypeCheckInternal = __GenericInstantConfig | Instant
// the __GenericInstantConfig type is used to avoid type widening issues with
// our choice to make exports the medium for programming a Next.js application
// With exports the type is controlled by the module and all we can do is assert on it
// from a consumer. However with string literals in objects these are by default typed widely
// and thus cannot match the discriminated union type. If we figure out a better way we should
// delete the __GenericInstantConfig member.
interface __GenericInstantConfig {
  level?: string
  unstable_samples?: Array<WideInstantSample>
  unstable_from?: string[]
  unstable_disableValidation?: boolean
  unstable_disableDevValidation?: boolean
  unstable_disableBuildValidation?: boolean
}

type WideInstantSample = {
  cookies?: InstantSample['cookies']
  headers?: Array<string[]>
  params?: InstantSample['params']
  searchParams?: InstantSample['searchParams']
}

export interface InstantConfig {
  level?: 'warning' | 'experimental-error'
  unstable_samples?: Array<InstantSample>
  unstable_from?: string[]
  unstable_disableValidation?: true
  unstable_disableDevValidation?: true
  unstable_disableBuildValidation?: true
}

export type InstantSample = {
  cookies?: Array<{
    name: string
    value: string | null
  }>
  headers?: Array<[string, string | null]>
  params?: { [key: string]: string | string[] }
  searchParams?: { [key: string]: string | string[] | null }
}

/**
 * The schema for configuration for a page.
 */
const AppSegmentConfigSchema = z.object({
  /**
   * The number of seconds to revalidate the page or false to disable revalidation.
   */
  revalidate: z
    .union([z.number().int().nonnegative(), z.literal(false)])
    .optional(),

  /**
   * Whether the page supports dynamic parameters.
   */
  dynamicParams: z.boolean().optional(),

  /**
   * The dynamic behavior of the page.
   */
  dynamic: z
    .enum(['auto', 'error', 'force-static', 'force-dynamic'])
    .optional(),

  /**
   * The caching behavior of the page.
   */
  fetchCache: z
    .enum([
      'auto',
      'default-cache',
      'only-cache',
      'force-cache',
      'force-no-store',
      'default-no-store',
      'only-no-store',
    ])
    .optional(),

  /**
   * How this segment should be prefetched.
   */
  unstable_instant: InstantConfigSchema.optional(),

  /**
   * Controls prefetching for this segment.
   * - 'auto' (default) is a noop.
   * - 'partial' enables Partial Prefetching. Only Cache Components are
   *   prefetched, not dynamic ones.
   * - 'unstable_eager' behaves like 'partial' but, when App Shells are enabled,
   *   keeps eagerly prefetching the route's segments instead of relying on the
   *   shared app shell. Internal migration aid; not part of the public API.
   * - 'allow-runtime' is a superset of 'partial' and permits prefetching with
   *   a runtime request instead of a static one.
   * - 'force-disabled' disables prefetching for the segment.
   */
  prefetch: PrefetchSchema.optional(),

  /**
   * The stale time for dynamic responses in seconds.
   * Controls how long the client-side router cache retains dynamic page data.
   * Pages only — not allowed in layouts.
   */
  unstable_dynamicStaleTime: z.number().int().nonnegative().optional(),

  /**
   * The preferred region for the page.
   */
  preferredRegion: z.union([z.string(), z.array(z.string())]).optional(),

  /**
   * The runtime to use for the page.
   */
  runtime: z.enum(['edge', 'nodejs']).optional(),

  /**
   * The maximum duration for the page in seconds.
   */
  maxDuration: z.number().int().nonnegative().optional(),
})

/**
 * Parse the app segment config.
 * @param data - The data to parse.
 * @param route - The route of the app.
 * @returns The parsed app segment config.
 */
export function parseAppSegmentConfig(
  data: unknown,
  route: string
): AppSegmentConfig {
  const parsed = AppSegmentConfigSchema.safeParse(data, {
    errorMap: (issue, ctx) => {
      if (issue.path.length === 1) {
        switch (issue.path[0]) {
          case 'revalidate': {
            return {
              message: `Invalid revalidate value ${JSON.stringify(
                ctx.data
              )} on "${route}", must be a non-negative number or false`,
            }
          }
          case 'unstable_instant': {
            return {
              // @TODO replace this link with a link to the docs when they are written
              message: `Invalid unstable_instant value ${JSON.stringify(ctx.data)} on "${route}", must be \`true\`, \`false\`, or an object. Read more at https://nextjs.org/docs/messages/invalid-instant-configuration`,
            }
          }
          case 'prefetch': {
            return {
              message: `Invalid prefetch value ${JSON.stringify(ctx.data)} on "${route}", must be "auto", "partial", "unstable_eager", "force-disabled", or "allow-runtime".`,
            }
          }
          case 'unstable_dynamicStaleTime': {
            return {
              message: `Invalid unstable_dynamicStaleTime value ${JSON.stringify(ctx.data)} on "${route}", must be a non-negative number`,
            }
          }
          default:
        }
      }

      return { message: ctx.defaultError }
    },
  })

  if (!parsed.success) {
    throw formatZodError(
      `Invalid segment configuration options detected for "${route}". Read more at https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config`,
      parsed.error
    )
  }

  return parsed.data
}

/**
 * The configuration for a page.
 */
export type AppSegmentConfig = {
  /**
   * The revalidation period for the page in seconds, or false to disable ISR.
   */
  revalidate?: number | false

  /**
   * Whether the page supports dynamic parameters.
   */
  dynamicParams?: boolean

  /**
   * The dynamic behavior of the page.
   */
  dynamic?: 'auto' | 'error' | 'force-static' | 'force-dynamic'

  /**
   * The caching behavior of the page.
   */
  fetchCache?:
    | 'auto'
    | 'default-cache'
    | 'default-no-store'
    | 'force-cache'
    | 'force-no-store'
    | 'only-cache'
    | 'only-no-store'

  /**
   * How this segment should be prefetched.
   */
  unstable_instant?: Instant

  /**
   * Controls prefetching for this segment.
   * - 'auto' (default) is a noop.
   * - 'partial' enables Partial Prefetching. Only Cache Components are
   *   prefetched, not dynamic ones.
   * - 'unstable_eager' behaves like 'partial' but, when App Shells are enabled,
   *   keeps eagerly prefetching the route's segments instead of relying on the
   *   shared app shell. Internal migration aid; not part of the public API.
   * - 'allow-runtime' is a superset of 'partial' and permits prefetching with
   *   a runtime request instead of a static one.
   * - 'force-disabled' disables prefetching for the segment.
   */
  prefetch?: Prefetch

  /**
   * The stale time for dynamic responses in seconds.
   * Controls how long the client-side router cache retains dynamic page data.
   * Pages only — not allowed in layouts.
   */
  unstable_dynamicStaleTime?: number

  /**
   * The preferred region for the page.
   */
  preferredRegion?: string | string[]

  /**
   * The runtime to use for the page.
   */
  runtime?: 'edge' | 'nodejs'

  /**
   * The maximum duration for the page in seconds.
   */
  maxDuration?: number
}

/**
 * The keys of the configuration for a page.
 *
 * @internal - required to exclude zod types from the build
 */
export const AppSegmentConfigSchemaKeys = AppSegmentConfigSchema.keyof().options
