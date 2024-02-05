import type { webpack } from 'next/dist/compiled/webpack/webpack'
import { isAppRouteRoute } from '../../lib/is-app-route-route'

export function traverseModules(
  compilation: webpack.Compilation,
  callback: (
    mod: any,
    chunk: webpack.Chunk,
    chunkGroup: (typeof compilation.chunkGroups)[0],
    modId: string | number
  ) => any,
  filterChunkGroup?: (chunkGroup: webpack.ChunkGroup) => boolean
) {
  compilation.chunkGroups.forEach((chunkGroup) => {
    if (filterChunkGroup && !filterChunkGroup(chunkGroup)) {
      return
    }
    chunkGroup.chunks.forEach((chunk: webpack.Chunk) => {
      const chunkModules = compilation.chunkGraph.getChunkModulesIterable(
        chunk
        // TODO: Update type so that it doesn't have to be cast.
      ) as Iterable<webpack.NormalModule>
      for (const mod of chunkModules) {
        const modId = compilation.chunkGraph.getModuleId(mod)
        callback(mod, chunk, chunkGroup, modId)
        const anyModule = mod as any
        if (anyModule.modules) {
          for (const subMod of anyModule.modules)
            callback(subMod, chunk, chunkGroup, modId)
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
    if (
      name.startsWith('pages/') ||
      // Skip for route.js entries
      (name.startsWith('app/') && isAppRouteRoute(name))
    ) {
      continue
    }

    // Check if the page entry is a server component or not.
    const entryDependency: webpack.NormalModule | undefined =
      entry.dependencies?.[0]
    // Ensure only next-app-loader entries are handled.
    if (!entryDependency || !entryDependency.request) continue

    const request = entryDependency.request

    if (
      !request.startsWith('next-edge-ssr-loader?') &&
      !request.startsWith('next-app-loader?')
    )
      continue

    let entryModule: webpack.NormalModule =
      compilation.moduleGraph.getResolvedModule(entryDependency)

    if (request.startsWith('next-edge-ssr-loader?')) {
      entryModule.dependencies.forEach((dependency) => {
        const modRequest: string | undefined = (dependency as any).request
        if (modRequest?.includes('next-app-loader')) {
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
