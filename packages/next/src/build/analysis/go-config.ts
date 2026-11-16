import { readFile } from 'fs/promises'
import { z } from 'next/dist/compiled/zod'
import type { NextConfig } from '../../server/config-shared'
import { MiddlewareConfigInputSchema } from '../segment-config/middleware/middleware-config'
import { getMiddlewareMatchers } from './get-page-static-info'

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
  nextConfig: Pick<NextConfig, 'basePath' | 'i18n'>
) {
  const { matcher } = await readDescriptorConfig(
    descriptorPath,
    sourcePath,
    proxySchema
  )
  try {
    return {
      // An omitted matcher matches every path.
      matchers: getMiddlewareMatchers(matcher ?? '/:path*', nextConfig),
    }
  } catch (error) {
    throw invalid(sourcePath, error)
  }
}
