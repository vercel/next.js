import type {
  Compilation,
  Chunk,
  ChunkGroup,
  NormalModule,
  Module,
  ModuleGraph,
  Compiler,
} from 'webpack'
import type { ModuleGraphConnection } from 'webpack'
import { getAppLoader } from '../entries'
import { spans as webpackCompilationSpans } from './plugins/profiling-plugin'
import { compilationSpans as rspackCompilationSpans } from './plugins/rspack-profiling-plugin'
import type { Span } from '../../trace'
import { BARREL_OPTIMIZATION_PREFIX } from '../../shared/lib/constants'
import path from 'path'
import { normalizePathSep } from '../../shared/lib/page-path/normalize-path-sep'
import { WEBPACK_RESOURCE_QUERIES } from '../../lib/constants'
import type { MetadataRouteLoaderOptions } from './loaders/next-metadata-route-loader'
import qs from 'querystring'

export function traverseModules(
  compilation: Compilation,
  callback: (
    mod: any,
    chunk: Chunk,
    chunkGroup: (typeof compilation.chunkGroups)[0],
    modId: string | null
  ) => any,
  filterChunkGroup?: (chunkGroup: ChunkGroup) => boolean
) {
  compilation.chunkGroups.forEach((chunkGroup) => {
    if (filterChunkGroup && !filterChunkGroup(chunkGroup)) {
      return
    }
    chunkGroup.chunks.forEach((chunk: Chunk) => {
      const chunkModules = compilation.chunkGraph.getChunkModulesIterable(
        chunk
        // TODO: Update type so that it doesn't have to be cast.
      ) as Iterable<NormalModule>
      for (const mod of chunkModules) {
        const modId = compilation.chunkGraph.getModuleId(mod)?.toString()
        if (modId) callback(mod, chunk, chunkGroup, modId)
        const anyModule = mod as any
        if (anyModule.modules) {
          for (const subMod of anyModule.modules)
            if (modId) callback(subMod, chunk, chunkGroup, modId)
        }
      }
    })
  })
}

// Loop over all the entry modules.
export function forEachEntryModule(
  compilation: any,
  callback: ({ name, entryModule }: { name: string; entryModule: any }) => void
) {
  for (const [name, entry] of compilation.entries.entries()) {
    // Skip for entries under pages/
    if (name.startsWith('pages/')) {
      continue
    }

    // Check if the page entry is a server component or not.
    const entryDependency: NormalModule | undefined = entry.dependencies?.[0]
    // Ensure only next-app-loader entries are handled.
    if (!entryDependency || !entryDependency.request) continue

    const request = entryDependency.request

    if (
      !request.startsWith('next-edge-ssr-loader?') &&
      !request.startsWith('next-edge-app-route-loader?') &&
      !request.startsWith(`${getAppLoader()}?`)
    )
      continue

    let entryModule: NormalModule =
      compilation.moduleGraph.getResolvedModule(entryDependency)

    if (
      request.startsWith('next-edge-ssr-loader?') ||
      request.startsWith('next-edge-app-route-loader?')
    ) {
      entryModule.dependencies.forEach((dependency) => {
        const modRequest: string | undefined = (dependency as any).request
        if (modRequest?.includes(getAppLoader())) {
          entryModule = compilation.moduleGraph.getResolvedModule(dependency)
        }
      })
    }

    callback({ name, entryModule })
  }
}

/**
 * Create a key that is a unique identifier for the resource and can be
 * consistently regenerated/shared across all compiler layers.
 *
 * We can't just use the module identifier because the server and client
 * compiler have different resolve configs and so wouldn't be consistent between
 * the two environments.
 */
export function getModuleResourceKey(
  context: string,
  mod: NormalModule
): string {
  let resourceKey: string = mod.resourceResolveData
    ? (mod.resourceResolveData.path || '') +
      (mod.resourceResolveData.query || '')
    : mod.resource // is already path + query

  // CSS modules: derived from last part of identifier
  if (mod.type === 'css/mini-extract')
    resourceKey = mod.identifier().split('!').pop() || ''

  // Metadata routes: derived from raw request file path
  if (mod.resource === `?${WEBPACK_RESOURCE_QUERIES.metadataRoute}`)
    resourceKey = getMetadataRouteResource(mod.rawRequest).filePath || ''

  // Context modules: don't have a resource path so just use identifier
  if (mod.constructor.name === 'ContextModule') resourceKey = mod.identifier()

  // If by this point we haven't got a resource key, don't attempt any further
  // resolution. Just bail out early with the plain module identifier
  if (!resourceKey) return mod.identifier()

  // Make resource key relative to compiler context so that different
  // client/server root directories aren't interpreted as different modules
  if (context) resourceKey = path.relative(context, resourceKey)
  if (!resourceKey.startsWith('.')) resourceKey = `./${resourceKey}`

  // By default the resource key is "<file path>?<query>#<export>" (e.g.
  // `foo.js#bar`). However, barrel optimizations can split one file into
  // multiple modules e.g. `foo.js#bar` and `foo.js#baz` become separate modules
  // exporting only their respective exports. We must therefore append an extra
  // query to the resource key so that they are treated as different modules
  if (mod.matchResource?.startsWith(BARREL_OPTIMIZATION_PREFIX))
    resourceKey = `${resourceKey}@${mod.matchResource}`

  resourceKey = normalizePathSep(resourceKey) // Normalize path separators
    .replace('/next/dist/esm/', '/next/dist/') // Always default to CommonJS

  return resourceKey
}

export function getMetadataRouteResource(
  request: string
): MetadataRouteLoaderOptions {
  // e.g. next-metadata-route-loader?filePath=<some-url-encoded-path>&isDynamicRouteExtension=1!?__next_metadata_route__
  const query = request.split('!')[0].split('next-metadata-route-loader?')[1]
  return qs.parse(query) as MetadataRouteLoaderOptions
}

export function getModuleReferencesInOrder(
  module: Module,
  moduleGraph: ModuleGraph
): ModuleGraphConnection[] {
  if (
    'getOutgoingConnectionsInOrder' in moduleGraph &&
    typeof moduleGraph.getOutgoingConnectionsInOrder === 'function'
  ) {
    return moduleGraph.getOutgoingConnectionsInOrder(module)
  }
  const connections = []
  for (const connection of moduleGraph.getOutgoingConnections(module)) {
    if (connection.dependency && connection.module) {
      connections.push({
        connection,
        index: moduleGraph.getParentBlockIndex(connection.dependency),
      })
    }
  }
  connections.sort((a, b) => a.index - b.index)
  return connections.map((c) => c.connection)
}

export function getCompilationSpan(
  compilation: Compiler | Compilation
): Span | undefined {
  const compilationSpans = process.env.NEXT_RSPACK
    ? rspackCompilationSpans
    : webpackCompilationSpans

  return compilationSpans.get(compilation)
}
