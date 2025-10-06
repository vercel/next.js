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

export function formatBarrelOptimizedResource(
  resource: string,
  matchResource: string
) {
  return `${resource}@${matchResource}`
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
