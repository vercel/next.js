import { z } from 'next/dist/compiled/zod'
import { formatZodError } from '../../../shared/lib/zod'

const CookieSchema = z
  .object({
    name: z.string(),
    value: z.string(),
    httpOnly: z.boolean().optional(),
    path: z.string().optional(),
  })
  .strict()

const RuntimeSampleSchema = z
  .object({
    cookies: z.array(CookieSchema).optional(),
    headers: z.array(z.tuple([z.string(), z.string()])).optional(),
    params: z.record(z.union([z.string(), z.array(z.string())])).optional(),
    searchParams: z
      .record(z.union([z.string(), z.array(z.string()), z.undefined()]))
      .optional(),
  })
  .strict()

const StaticPrefetchSchema = z
  .object({
    mode: z.literal('static'),
    from: z.array(z.string()).optional(),
    expectUnableToVerify: z.boolean().optional(),
  })
  .strict()

const RuntimePrefetchSchema = z
  .object({
    mode: z.literal('runtime'),
    samples: z.array(RuntimeSampleSchema).min(1),
    from: z.array(z.string()).optional(),
    expectUnableToVerify: z.boolean().optional(),
  })
  .strict()

const PrefetchSchema = z.discriminatedUnion('mode', [
  StaticPrefetchSchema,
  RuntimePrefetchSchema,
])

export type Prefetch = StaticPrefetch | RuntimePrefetch
export type PrefetchForTypeCheckInternal = __GenericPrefetch | Prefetch
// the __GenericPrefetch type is used to avoid type widening issues with
// our choice to make exports the medium for programming a Next.js application
// With exports the type is controlled by the module and all we can do is assert on it
// from a consumer. However with string literals in objects these are by default typed widely
// and thus cannot match the discriminated union type. If we figure out a better way we should
// delete the __GenericPrefetch member.
interface __GenericPrefetch {
  mode: string
  samples?: Array<WideRuntimeSample>
  from?: string[]
  expectUnableToVerify?: boolean
}
interface StaticPrefetch {
  mode: 'static'
  from?: string[]
  expectUnableToVerify?: boolean
}
interface RuntimePrefetch {
  mode: 'runtime'
  samples: Array<RuntimeSample>
  from?: string[]
  expectUnableToVerify?: boolean
}
type WideRuntimeSample = {
  cookies?: RuntimeSample['cookies']
  headers?: Array<string[]>
  params?: RuntimeSample['params']
  searchParams?: RuntimeSample['searchParams']
}
type RuntimeSample = {
  cookies?: Array<{
    name: string
    value: string
    httpOnly?: boolean
    path?: string
  }>
  headers?: Array<[string, string]>
  params?: { [key: string]: string | string[] }
  searchParams?: { [key: string]: string | string[] | undefined }
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
   * (only applicable when `clientSegmentCache` is enabled)
   */
  unstable_prefetch: PrefetchSchema.optional(),

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
          case 'unstable_prefetch': {
            return {
              // @TODO replace this link with a link to the docs when they are written
              message: `Invalid unstable_prefetch value ${JSON.stringify(ctx.data)} on "${route}", must be an object with a mode of "static" or "runtime". Read more at https://nextjs.org/docs/messages/invalid-prefetch-configuration`,
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
   * (only applicable when `clientSegmentCache` is enabled)
   */
  unstable_prefetch?: Prefetch

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
