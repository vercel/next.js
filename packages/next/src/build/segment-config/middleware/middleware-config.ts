import picomatch from 'next/dist/compiled/picomatch'
import { z } from 'next/dist/compiled/zod'
import { tryToParsePath } from '../../../lib/try-to-parse-path'
import type { RouteHas } from '../../../lib/load-custom-routes'

const RouteHasSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.enum(['header', 'query', 'cookie']),
      key: z.string({
        required_error: 'key is required when type is header, query or cookie',
      }),
      value: z
        .string({
          invalid_type_error: 'value must be a string',
        })
        .optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('host'),
      value: z.string({
        required_error: 'host must have a value',
      }),
    })
    .strict(),
])

/**
 * @internal - required to exclude zod types from the build
 */
export const SourceSchema = z
  .string({
    required_error: 'source is required',
  })
  .max(4096, 'exceeds max built length of 4096 for route')
  .superRefine((val, ctx) => {
    if (!val.startsWith('/')) {
      return ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `source must start with /`,
      })
    }

    const { error, regexStr } = tryToParsePath(val)

    if (error || !regexStr) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid source '${val}': ${error.message}`,
      })
    }
  })

const MiddlewareMatcherInputSchema = z
  .object({
    locale: z.union([z.literal(false), z.undefined()]).optional(),
    has: z.array(RouteHasSchema).optional(),
    missing: z.array(RouteHasSchema).optional(),
    source: SourceSchema,
  })
  .strict()

const MiddlewareConfigMatcherInputSchema = z.union([
  SourceSchema,
  z.array(
    z.union([SourceSchema, MiddlewareMatcherInputSchema], {
      invalid_type_error: 'must be an array of strings or middleware matchers',
    })
  ),
])

/**
 * @internal - required to exclude zod types from the build
 */
export type MiddlewareConfigMatcherInput = z.infer<
  typeof MiddlewareConfigMatcherInputSchema
>

const GlobSchema = z.string().superRefine((val, ctx) => {
  try {
    picomatch(val)
  } catch (err: any) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Invalid glob pattern '${val}': ${err.message}`,
    })
  }
})

/**
 * @internal - required to exclude zod types from the build
 */
export const MiddlewareConfigInputSchema = z.object({
  /**
   * The matcher for the middleware.
   */
  matcher: MiddlewareConfigMatcherInputSchema.optional(),

  /**
   * The regions that the middleware should run in.
   */
  regions: z.union([z.string(), z.array(z.string())]).optional(),

  /**
   * A glob, or an array of globs, ignoring dynamic code evaluation for specific
   * files. The globs are relative to your application root folder.
   */
  unstable_allowDynamic: z.union([GlobSchema, z.array(GlobSchema)]).optional(),
})

export type MiddlewareConfigInput = {
  /**
   * The matcher for the middleware.
   */
  matcher?:
    | string
    | Array<
        | {
            locale?: false
            has?: RouteHas[]
            missing?: RouteHas[]
            source: string
          }
        | string
      >

  /**
   * The regions that the middleware should run in.
   */
  regions?: string | string[]

  /**
   * A glob, or an array of globs, ignoring dynamic code evaluation for specific
   * files. The globs are relative to your application root folder.
   */
  unstable_allowDynamic?: string | string[]
}

/**
 * The keys of the configuration for a middleware.
 *
 * @internal - required to exclude zod types from the build
 */
export const MiddlewareConfigInputSchemaKeys =
  MiddlewareConfigInputSchema.keyof().options
