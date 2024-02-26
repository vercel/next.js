import type { Chunk, ChunkGraph, Compiler } from 'webpack'

const PLUGIN_NAME = 'MergeCssChunksPlugin'

/**
 * Css chunks smaller than this size will be merged with other css chunks.
 */
const MIN_CSS_CHUNK_SIZE = 30 * 1024
/**
 * When merging css chunks it will select an number N where the total size is just bigger than this size.
 * Exception: N must be at least 2 even if the size is already bigger than this size.
 */
const TARGET_CSS_CHUNK_SIZE = 60 * 1024
/**
 * When an entrypoint has more css chunks than this number it merge the smallest ones to try to stay below that number.
 * Exception: When there are more than twice as much css chunks that larger than MAX_CSS_CHUNK_SIZE it will only half the number of css chunks.
 */
const MAX_CSS_CHUNKS = 15

function isCssChunk(chunkGraph: ChunkGraph, chunk: Chunk): boolean {
  for (const mod of chunkGraph.getChunkModulesIterable(chunk)) {
    return mod.type.startsWith('css')
  }
  return false
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
          for (const [, entrypoint] of compilation.entrypoints) {
            const cssChunks = entrypoint.chunks
              .filter((chunk) => isCssChunk(chunkGraph, chunk))
              .map((chunk) => [chunk, chunkGraph.getChunkSize(chunk)] as const)
            cssChunks.sort((a, b) => b[1] - a[1])

            // We want have at most MAX_CSS_CHUNKS chunks.
            // When we start merging at startMergingIndex this would half the number of chunks after that index.
            const startMergingIndex = 2 * MAX_CSS_CHUNKS - cssChunks.length

            // We select small chunks and chunks after the index
            const selectedCssChunks = cssChunks.filter(
              ([, size], i) =>
                size < MIN_CSS_CHUNK_SIZE || i >= startMergingIndex
            )
            while (selectedCssChunks.length >= 2) {
              const [biggest, bigSize] = selectedCssChunks.shift()!
              let mergedSize = bigSize
              do {
                const [smallest, size] = selectedCssChunks.pop()!
                if (chunkGraph.canChunksBeIntegrated(biggest, smallest)) {
                  chunkGraph.integrateChunks(biggest, smallest)
                  compilation.chunks.delete(smallest)
                  mergedSize += size
                  changed = true
                }
              } while (
                selectedCssChunks.length > 0 &&
                mergedSize < TARGET_CSS_CHUNK_SIZE
              )
            }
          }
          return changed
        }
      )
    })
  }
}
