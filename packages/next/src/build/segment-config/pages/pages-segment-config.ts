import { z } from 'next/dist/compiled/zod'
import { formatZodError } from '../../../shared/lib/zod'

/**
 * The schema for the page segment config.
 */
const PagesSegmentConfigSchema = z.object({
  /**
   * The runtime to use for the page.
   */
  runtime: z.enum(['edge', 'experimental-edge', 'nodejs']).optional(),

  /**
   * The maximum duration for the page render.
   */
  maxDuration: z.number().optional(),

  /**
   * The exported config object for the page.
   */
  config: z
    .object({
      /**
       * The runtime to use for the page.
       */
      runtime: z.enum(['edge', 'experimental-edge', 'nodejs']).optional(),

      /**
       * The maximum duration for the page render.
       */
      maxDuration: z.number().optional(),
    })
    .optional(),
})

/**
 * Parse the page segment config.
 * @param data - The data to parse.
 * @param route - The route of the page.
 * @returns The parsed page segment config.
 */
export function parsePagesSegmentConfig(
  data: unknown,
  route: string
): PagesSegmentConfig {
  const parsed = PagesSegmentConfigSchema.safeParse(data, {})
  if (!parsed.success) {
    throw formatZodError(
      `Invalid segment configuration options detected for "${route}". Read more at https://nextjs.org/docs/messages/invalid-page-config`,
      parsed.error
    )
  }

  return parsed.data
}

/**
 * The keys of the configuration for a page.
 *
 * @internal - required to exclude zod types from the build
 */
export const PagesSegmentConfigSchemaKeys =
  PagesSegmentConfigSchema.keyof().options

export type PagesSegmentConfigConfig = {
  /**
   * The maximum duration for the page render.
   */
  maxDuration?: number

  /**
   * The runtime to use for the page.
   */
  runtime?: 'edge' | 'experimental-edge' | 'nodejs'

  /**
   * The preferred region for the page.
   */
  regions?: string[]
}

export type PagesSegmentConfig = {
  /**
   * The runtime to use for the page.
   */
  runtime?: 'edge' | 'experimental-edge' | 'nodejs'

  /**
   * The maximum duration for the page render.
   */
  maxDuration?: number

  /**
   * The exported config object for the page.
   */
  config?: PagesSegmentConfigConfig
}
