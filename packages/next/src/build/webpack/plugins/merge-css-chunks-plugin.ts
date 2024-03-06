import type { Chunk, ChunkGraph, Compiler, ChunkGroup } from 'webpack'

const PLUGIN_NAME = 'MergeCssChunksPlugin'

/**
 * Merge chunks until they are bigger than the target size.
 */
const MIN_CSS_CHUNK_SIZE = 30 * 1024
/**
 * Avoid merging chunks when they would be bigger than this size.
 */
const MAX_CSS_CHUNK_SIZE = 100 * 1024

function isCssChunk(chunkGraph: ChunkGraph, chunk: Chunk): boolean {
  for (const mod of chunkGraph.getChunkModulesIterable(chunk)) {
    return mod.type.startsWith('css')
  }
  return false
}

type CssChunkInfo = {
  entrypoints: Map<
    ChunkGroup,
    {
      prev: Chunk | null
      next: Chunk | null
    }
  >
  size: number
}
type ChunkGroupItem = {
  entrypoint: ChunkGroup
  cssChunks: Set<Chunk>
  size: number
}

export class MergeCssChunksPlugin {
  public apply(compiler: Compiler) {
    compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation) => {
      let once = false
      compilation.hooks.optimizeChunks.tap(
        {
          name: PLUGIN_NAME,
          stage: 20,
        },
        () => {
          if (once) {
            return
          }
          once = true
          const chunkGraph = compilation.chunkGraph
          let changed = false

          const cssChunkInfo = new Map<Chunk, CssChunkInfo>()
          const cssChunksForChunkGroup = new Map<ChunkGroup, Set<Chunk>>()
          const chunkGroups: ChunkGroupItem[] = []

          // Add all css chunks to the maps and lists
          for (const [, entrypoint] of compilation.entrypoints) {
            const cssChunks = entrypoint.chunks.filter((chunk) =>
              isCssChunk(chunkGraph, chunk)
            )

            if (cssChunks.length <= 1) continue

            let totalSize = 0
            const set = new Set<Chunk>()

            function addChunk(
              chunk: Chunk,
              prev: Chunk | null,
              next: Chunk | null
            ) {
              let info = cssChunkInfo.get(chunk)
              if (info === undefined) {
                info = {
                  entrypoints: new Map(),
                  size: chunkGraph.getChunkSize(chunk),
                }
                cssChunkInfo.set(chunk, info)
              }
              info.entrypoints.set(entrypoint, { prev, next })
              totalSize += info.size
              if (info.size < MAX_CSS_CHUNK_SIZE) set.add(chunk)
            }

            const first = cssChunks[0]
            const second = cssChunks[1]
            addChunk(first, null, second)
            for (let i = 2; i < cssChunks.length; i++) {
              const prev = cssChunks[i - 2]
              const current = cssChunks[i - 1]
              const next = cssChunks[i]
              addChunk(current, prev, next)
            }
            const last = cssChunks[cssChunks.length - 1]
            addChunk(last, cssChunks[cssChunks.length - 2], null)

            cssChunksForChunkGroup.set(entrypoint, set)
            chunkGroups.push({ entrypoint, cssChunks: set, size: totalSize })
          }

          // Sorting for determinism, order isn't that relevant
          chunkGroups.sort(
            (a, b) => b.cssChunks.size - a.cssChunks.size || b.size - a.size
          )

          // Checks if two chunks can be merged without breaking css order and size limits
          function canBeMerged(a: Chunk, b: Chunk) {
            const aInfo = cssChunkInfo.get(a)!
            const bInfo = cssChunkInfo.get(b)!
            if (
              aInfo.size > MIN_CSS_CHUNK_SIZE &&
              bInfo.size > MIN_CSS_CHUNK_SIZE
            ) {
              // No need to merge them since they are already big enough
              return false
            }
            if (aInfo.size + bInfo.size > MAX_CSS_CHUNK_SIZE) {
              // Can't merge than as that would be too big
              return false
            }
            for (const [entrypoint, infoInA] of aInfo.entrypoints) {
              if (bInfo.entrypoints.has(entrypoint) && infoInA.next !== b) {
                // Can't merge as they are both in the same entrypoint, but are not siblings
                // Merging them would break the css order
                return false
              }
            }
            return chunkGraph.canChunksBeIntegrated(a, b)
          }

          /**
           * Update datastructure to reflect that `removedChunk` is being merged into `newChunk`
           */
          function updateInfoForMerging(removedChunk: Chunk, newChunk: Chunk) {
            const info = cssChunkInfo.get(removedChunk)!
            const newInfo = cssChunkInfo.get(newChunk)!
            for (const [entrypoint, entryInfo] of info.entrypoints) {
              const prev = entryInfo.prev !== newChunk ? entryInfo.prev : null
              const next = entryInfo.next !== newChunk ? entryInfo.next : null
              if (prev) {
                const prevInfo = cssChunkInfo.get(prev)!
                prevInfo.entrypoints.get(entrypoint)!.next = newChunk
              }
              if (next) {
                const nextInfo = cssChunkInfo.get(next)!
                nextInfo.entrypoints.get(entrypoint)!.prev = newChunk
              }
              cssChunksForChunkGroup.get(entrypoint)!.delete(removedChunk)
              let newEntryInfo = newInfo.entrypoints.get(entrypoint)
              if (newEntryInfo !== undefined) {
                newEntryInfo.prev =
                  newEntryInfo.prev === removedChunk ? prev : newEntryInfo.prev
                newEntryInfo.next =
                  newEntryInfo.next === removedChunk ? next : newEntryInfo.next
              } else {
                newEntryInfo = { prev, next }
                newInfo.entrypoints.set(entrypoint, newEntryInfo)
              }
            }
            cssChunkInfo.delete(removedChunk)
            return info
          }

          // Merge chunks, until nothing more can be merged
          let changedInIteration = false
          do {
            changedInIteration = false
            for (const { entrypoint, cssChunks } of chunkGroups) {
              for (const chunk of cssChunks) {
                const info = cssChunkInfo.get(chunk)!
                const entryInfo = info.entrypoints.get(entrypoint)!
                const next = entryInfo.next
                if (!next) continue

                if (canBeMerged(chunk, next)) {
                  // `next` will be removed, so we need to update the pointers to it from other chunks
                  updateInfoForMerging(next, chunk)

                  // Really merge it
                  chunkGraph.integrateChunks(chunk, next)
                  compilation.chunks.delete(next)
                  changed = true
                  changedInIteration = true
                }
              }
            }
          } while (changedInIteration)

          return changed
        }
      )
    })
  }
}
