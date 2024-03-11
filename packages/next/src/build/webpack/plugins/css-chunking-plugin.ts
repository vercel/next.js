import type { Chunk, ChunkGraph, Compiler, ChunkGroup, Module } from 'webpack'

const PLUGIN_NAME = 'CssChunkingPlugin'

/**
 * Merge chunks until they are bigger than the target size.
 */
const MIN_CSS_CHUNK_SIZE = 30 * 1024
/**
 * Avoid merging chunks when they would be bigger than this size.
 */
const MAX_CSS_CHUNK_SIZE = 100 * 1024

type ChunkState = {
  chunk: Chunk
  modules: Module[]
  order: number
}

export class CssChunkingPlugin {
  public apply(compiler: Compiler) {
    compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation) => {
      let once = false
      compilation.hooks.optimizeChunks.tap(
        {
          name: PLUGIN_NAME,
          stage: 5,
        },
        () => {
          if (once) {
            return
          }
          once = true
          const chunkGraph = compilation.chunkGraph
          let changed = false

          const chunkStates = new Map<Chunk, ChunkState>()
          const chunkStatesByModule = new Map<Module, Map<ChunkState, number>>()
          const newChunksByModule = new Map<Module, Chunk>()

          for (const chunk of compilation.chunks) {
            const modules = []
            for (const module of chunkGraph.getChunkModulesIterable(chunk)) {
              if (!module.type?.startsWith('css')) continue
              modules.push(module)
            }
            if (!modules.length) continue
            const chunkState = {
              chunk,
              modules,
              order: 0,
            }
            chunkStates.set(chunk, chunkState)
            for (let i = 0; i < modules.length; i++) {
              const module = modules[i]
              let moduleChunkStates = chunkStatesByModule.get(module)
              if (!moduleChunkStates) {
                moduleChunkStates = new Map()
                chunkStatesByModule.set(module, moduleChunkStates)
              }
              moduleChunkStates.set(chunkState, i)
              chunkStatesByModule.set(module, moduleChunkStates)
            }
          }

          const orderedModules: { module: Module; sum: number }[] = []

          for (const [module, moduleChunkStates] of chunkStatesByModule) {
            let sum = 0
            for (const i of moduleChunkStates.values()) {
              sum += i
            }
            orderedModules.push({ module, sum })
          }

          orderedModules.sort((a, b) => a.sum - b.sum)

          const remainingModules = new Set(
            orderedModules.map(({ module }) => module)
          )

          for (const startModule of remainingModules) {
            const startChunkStates = chunkStatesByModule.get(startModule)!
            let allChunkStates = new Map(startChunkStates)
            const newChunkModules = [startModule]
            remainingModules.delete(startModule)
            let currentSize = startModule.size()

            const potentialNextModules = new Set<Module>()
            for (const [chunkState, i] of allChunkStates) {
              const nextModule = chunkState.modules[i + 1]
              if (nextModule && remainingModules.has(nextModule)) {
                potentialNextModules.add(nextModule)
              }
            }
            let cont
            do {
              cont = false
              loop: for (const nextModule of potentialNextModules) {
                const size = nextModule.size()
                if (currentSize + size > MAX_CSS_CHUNK_SIZE) {
                  // Chunk would be too large
                  continue
                }
                const nextChunkStates = chunkStatesByModule.get(nextModule)!
                for (const [chunkState, i] of nextChunkStates) {
                  const prevState = allChunkStates.get(chunkState)
                  if (prevState === undefined) {
                    // New chunk group, can add it, but should we?
                    // We only add that if below min size
                    if (currentSize < MIN_CSS_CHUNK_SIZE) {
                      continue
                    } else {
                      continue loop
                    }
                  } else if (prevState + 1 === i) {
                    // Existing chunk group, order fits
                    continue
                  } else {
                    // Existing chunk group, there is something in between or order is reversed
                    continue loop
                  }
                }
                potentialNextModules.delete(nextModule)
                remainingModules.delete(nextModule)
                currentSize += size
                for (const [chunkState, i] of nextChunkStates) {
                  allChunkStates.set(chunkState, i)
                  const newNextModule = chunkState.modules[i + 1]
                  if (newNextModule && remainingModules.has(newNextModule)) {
                    potentialNextModules.add(newNextModule)
                  }
                }
                newChunkModules.push(nextModule)
                cont = true
                break
              }
            } while (cont)
            const newChunk = compilation.addChunk()
            newChunk.preventIntegration = true
            newChunk.idNameHints.add('css')
            for (const module of newChunkModules) {
              chunkGraph.connectChunkAndModule(newChunk, module)
              newChunksByModule.set(module, newChunk)
            }
            changed = true
          }

          for (const { chunk, modules } of chunkStates.values()) {
            const chunks = new Set()
            for (const module of modules) {
              chunkGraph.disconnectChunkAndModule(chunk, module)
              const newChunk = newChunksByModule.get(module)!
              if (chunks.has(newChunk)) continue
              chunks.add(newChunk)
              chunk.split(newChunk)
            }
          }

          return changed
        }
      )
    })
  }
}
