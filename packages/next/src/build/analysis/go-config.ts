import { readFile } from 'fs/promises'
import { z } from 'next/dist/compiled/zod'
import type { NextConfig } from '../../server/config-shared'
import {
  RSC_SUFFIX,
  RSC_SEGMENT_SUFFIX,
  RSC_SEGMENTS_DIR_SUFFIX,
} from '../../lib/constants'
import { tryToParsePath } from '../../lib/try-to-parse-path'
import { escapeStringRegexp } from '../../shared/lib/escape-regexp'
import { formatZodError } from '../../shared/lib/zod'
import {
  MiddlewareConfigInputSchema,
  SourceSchema,
  type MiddlewareConfigMatcherInput,
} from '../segment-config/middleware/middleware-config'

const appRouteTransportSuffix = `${escapeStringRegexp(RSC_SUFFIX)}|${escapeStringRegexp(RSC_SEGMENTS_DIR_SUFFIX)}/.+${escapeStringRegexp(RSC_SEGMENT_SUFFIX)}`

const routeSchema = z
  .object({
    maxDuration: z.number().int().positive().optional(),
  })
  .strict()
// Like proxy.ts, a Go proxy only configures matchers.
const proxySchema = z
  .object({
    matcher: MiddlewareConfigInputSchema.shape.matcher,
  })
  .strict()

function invalid(sourcePath: string, error: unknown): Error {
  return new Error(
    `Invalid static Go config in ${sourcePath}: ${error instanceof Error ? error.message : String(error)}`
  )
}

function createGoProxyMatchers(
  matcherOrMatchers: MiddlewareConfigMatcherInput,
  { basePath, i18n }: Pick<NextConfig, 'basePath' | 'i18n'>
) {
  const matchers = Array.isArray(matcherOrMatchers)
    ? matcherOrMatchers
    : [matcherOrMatchers]

  return matchers.map((matcher) => {
    const { source: originalSource, ...conditions } =
      typeof matcher === 'string' ? { source: matcher } : matcher
    const isRoot = originalSource === '/'
    let source = originalSource

    if (i18n?.locales && conditions.locale !== false) {
      source = `/:nextInternalLocale((?!_next/)[^/.]{1,})${isRoot ? '' : source}`
    }

    // Match the same page through data, RSC, and segment-prefetch requests.
    const suffix = isRoot
      ? `(${i18n ? '|\\.json|' : ''}/?index|/?index\\.json|/?index(?:${appRouteTransportSuffix}))?`
      : `{(\\.json|${appRouteTransportSuffix})}?`
    source = `${basePath || ''}/:nextData(_next/data/[^/]{1,})?${source}${suffix}`

    // Expansion can make an otherwise valid literal invalid. Throw so dev can
    // fail closed and recover after an edit without terminating the server.
    const result = SourceSchema.safeParse(source)
    if (!result.success) {
      throw formatZodError('Failed to parse Go proxy matcher', result.error)
    }

    return {
      ...conditions,
      regexp: tryToParsePath(result.data).regexStr!,
      originalSource,
    }
  })
}

// Turbopack reads `var Config` from the same Go syntax analysis that discovers
// handlers, and records it in the entry's native descriptor. Nothing here parses
// Go source, so the descriptor is only available after the entry compiled.
async function readDescriptorConfig<T extends z.ZodTypeAny>(
  descriptorPath: string,
  sourcePath: string,
  schema: T
): Promise<z.infer<T>> {
  try {
    const descriptor = JSON.parse(await readFile(descriptorPath, 'utf8'))
    return schema.parse(descriptor.config ?? {})
  } catch (error) {
    throw invalid(sourcePath, error)
  }
}

export function readGoRouteConfig(descriptorPath: string, sourcePath: string) {
  return readDescriptorConfig(descriptorPath, sourcePath, routeSchema)
}

export async function readGoProxyConfig(
  descriptorPath: string,
  sourcePath: string,
  nextConfig: Pick<NextConfig, 'basePath' | 'i18n'>,
  { isAdapterBuild = false }: { isAdapterBuild?: boolean } = {}
) {
  const { matcher } = await readDescriptorConfig(
    descriptorPath,
    sourcePath,
    proxySchema
  )
  try {
    const matchers = createGoProxyMatchers(matcher ?? '/:path*', nextConfig)
    if (
      isAdapterBuild &&
      matchers.some((compiledMatcher) =>
        [
          ...(compiledMatcher.has ?? []),
          ...(compiledMatcher.missing ?? []),
        ].some(
          (condition) =>
            condition.type === 'header' || condition.type === 'cookie'
        )
      )
    ) {
      throw new Error(
        'Go proxy header and cookie matcher conditions are not supported in adapter builds. ' +
          'Remove these conditions from proxy.go Config.Matcher or self-host with next start.'
      )
    }
    return {
      matchers,
    }
  } catch (error) {
    throw invalid(sourcePath, error)
  }
}
