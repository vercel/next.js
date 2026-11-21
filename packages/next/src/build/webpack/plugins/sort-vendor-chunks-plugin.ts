import type { webpack } from 'next/dist/compiled/webpack/webpack'

const PLUGIN_NAME = 'SortVendorChunksPlugin'

/**
 * Prefix of the chunks that the development server compiler splits each
 * package in `node_modules` into.
 */
export const VENDOR_CHUNK_PREFIX = 'vendor-chunks/'

function isVendorChunk(chunk: webpack.Chunk): boolean {
  return !!chunk.name?.startsWith(VENDOR_CHUNK_PREFIX)
}

function compareChunkNames(a: webpack.Chunk, b: webpack.Chunk): number {
  const nameA = a.name ?? ''
  const nameB = b.name ?? ''
  return nameA < nameB ? -1 : nameA > nameB ? 1 : 0
}

/**
 * Sorts the vendor chunks of every chunk group by name.
 *
 * `SplitChunksPlugin` creates the vendor chunks in an order that depends on how
 * many entries share each package, and adds them to the chunk groups in that
 * order. An entry's startup code lists the chunks of its group, so compiling or
 * disposing one entry could reorder the vendor chunks of another, unchanged
 * entry and change its output. For `pages/_document`, this used to send a
 * "_document has changed" full reload to every open page.
 *
 * Only the vendor chunks swap places with each other, other chunks keep their
 * position. On the server, loading a chunk only registers its modules, so the
 * order in which the vendor chunks are loaded does not matter.
 */
export class SortVendorChunksPlugin {
  apply(compiler: webpack.Compiler) {
    compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation) => {
      compilation.hooks.afterOptimizeChunks.tap(
        PLUGIN_NAME,
        (_chunks, chunkGroups) => {
          for (const chunkGroup of chunkGroups) {
            const positions: number[] = []
            const vendorChunks: webpack.Chunk[] = []
            chunkGroup.chunks.forEach((chunk, index) => {
              if (isVendorChunk(chunk)) {
                positions.push(index)
                vendorChunks.push(chunk)
              }
            })

            vendorChunks.sort(compareChunkNames)
            positions.forEach((position, index) => {
              chunkGroup.chunks[position] = vendorChunks[index]
            })
          }
        }
      )
    })
  }
}
