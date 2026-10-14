import type { ClientBuildManifest } from '../build/webpack/plugins/build-manifest-plugin-utils'
import type { createRouteKeys, createRoutes } from '../shared/lib/route-types'

/**
 * Ingest the framework-emitted client manifest through its legacy ambient
 * string-indexed declaration. Webpack's build-manifest-plugin and Turbopack's
 * manifest-loader supply URL keys, sortedPages and rewrite/filter metadata.
 * This is a producer trust boundary, not validation of that native schema.
 *
 * Reuse the primitive key/member guards without introducing a build-schema
 * dependency into the shared brand layer. Keep file payload types, array shape,
 * metadata and the original object; no fields are inspected or copied.
 */
export function ingestClientBuildManifest<
  Value extends Record<string, string[]>,
>(
  value: Value &
    Parameters<typeof createRouteKeys<Value>>[0] & {
      sortedPages?: Parameters<typeof createRoutes<Value['sortedPages']>>[0]
    }
): ClientBuildManifest &
  ReturnType<typeof createRouteKeys<Omit<Value, 'sortedPages'>>> & {
    sortedPages: ReturnType<typeof createRoutes<Value['sortedPages']>>
  } {
  return value as unknown as ClientBuildManifest &
    ReturnType<typeof createRouteKeys<Omit<Value, 'sortedPages'>>> & {
      sortedPages: ReturnType<typeof createRoutes<Value['sortedPages']>>
    }
}
