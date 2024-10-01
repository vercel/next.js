import { z } from 'next/dist/compiled/zod'

/**
 * The schema for configuration for a page.
 *
 * @internal
 */
export const AppSegmentConfigSchema = z.object({
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
   * The preferred region for the page.
   */
  preferredRegion: z.union([z.string(), z.array(z.string())]).optional(),

  /**
   * Whether the page supports partial prerendering. When true, the page will be
   * served using partial prerendering. This setting will only take affect if
   * it's enabled via the `experimental.ppr = "incremental"` option.
   */
  experimental_ppr: z.boolean().optional(),

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
   * The preferred region for the page.
   */
  preferredRegion?: string | string[]

  /**
   * Whether the page supports partial prerendering. When true, the page will be
   * served using partial prerendering. This setting will only take affect if
   * it's enabled via the `experimental.ppr = "incremental"` option.
   */
  experimental_ppr?: boolean

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
 * @internal
 */
export const AppSegmentConfigSchemaKeys = AppSegmentConfigSchema.keyof().options
