import type { Chunk, Compiler, Module } from 'webpack'

const PLUGIN_NAME = 'CssChunkingPlugin'

/**
 * Merge chunks until they are bigger than the target size.
 */
const MIN_CSS_CHUNK_SIZE = 30 * 1024
/**
 * Avoid merging chunks when they would be bigger than this size.
 */
const MAX_CSS_CHUNK_SIZE = 100 * 1024

function isGlobalCss(module: Module) {
  return !/\.module\.(css|scss|sass)$/.test(module.nameForCondition() || '')
}

type ChunkState = {
  chunk: Chunk
  modules: Module[]
  order: number
  requests: number
}

export class CssChunkingPlugin {
  private strict: boolean
  constructor(strict: boolean) {
    this.strict = strict
  }

  public apply(compiler: Compiler) {
    const strict = this.strict
    const summary = !!process.env.CSS_CHUNKING_SUMMARY
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
          let changed: undefined | true = undefined

          const chunkStates = new Map<Chunk, ChunkState>()
          const chunkStatesByModule = new Map<Module, Map<ChunkState, number>>()

          // Collect all css modules in chunks and the execpted order of them
          for (const chunk of compilation.chunks) {
            if (chunk.name?.startsWith('pages/')) continue
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
              requests: modules.length,
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

          // Sort modules by their index sum
          const orderedModules: { module: Module; sum: number }[] = []

          for (const [module, moduleChunkStates] of chunkStatesByModule) {
            let sum = 0
            for (const i of moduleChunkStates.values()) {
              sum += i
            }
            orderedModules.push({ module, sum })
          }

          orderedModules.sort((a, b) => a.sum - b.sum)

          // A queue of modules that still need to be processed
          const remainingModules = new Set(
            orderedModules.map(({ module }) => module)
          )

          // In loose mode we guess the dependents of modules from the order
          // assuming that when a module is a dependency of another module
          // it will always appear before it in every chunk.
          const allDependents = new Map<Module, Set<Module>>()

          if (!this.strict) {
            for (const b of remainingModules) {
              const dependent = new Set<Module>()
              loop: for (const a of remainingModules) {
                if (a === b) continue
                // check if a depends on b
                for (const [chunkState, ia] of chunkStatesByModule.get(a)!) {
                  const bChunkStates = chunkStatesByModule.get(b)!
                  const ib = bChunkStates.get(chunkState)
                  if (ib === undefined) {
                    // If a would depend on b, it would be included in that chunk group too
                    continue loop
                  }
                  if (ib > ia) {
                    // If a would depend on b, b would be before a in order
                    continue loop
                  }
                }
                dependent.add(a)
              }
              if (dependent.size > 0) allDependents.set(b, dependent)
            }
          }

          // Stores the new chunk for every module
          const newChunksByModule = new Map<Module, Chunk>()

          // Process through all modules
          for (const startModule of remainingModules) {
            let globalCssMode = isGlobalCss(startModule)

            // The current position of processing in all selected chunks
            let allChunkStates = new Map(chunkStatesByModule.get(startModule)!)

            // The list of modules that goes into the new chunk
            const newChunkModules = new Set([startModule])

            // The current size of the new chunk
            let currentSize = startModule.size()

            // A pool of potential modules where the next module is selected from.
            // It's filled from the next module of the selected modules in every chunk.
            // It also keeps some metadata to improve performance [size, chunkStates].
            const potentialNextModules = new Map<
              Module,
              [number, Map<ChunkState, number>]
            >()
            for (const [chunkState, i] of allChunkStates) {
              const nextModule = chunkState.modules[i + 1]
              if (nextModule && remainingModules.has(nextModule)) {
                potentialNextModules.set(nextModule, [
                  nextModule.size(),
                  chunkStatesByModule.get(nextModule)!,
                ])
              }
            }

            // Try to add modules to the chunk until a break condition is met
            let cont
            do {
              cont = false
              // We try to select a module that reduces request count and
              // has the highest number of requests
              const orderedPotentialNextModules = []
              for (const [
                nextModule,
                [size, nextChunkStates],
              ] of potentialNextModules) {
                let maxRequests = 0
                for (const chunkState of nextChunkStates.keys()) {
                  // There is always some overlap
                  if (allChunkStates.has(chunkState)) {
                    maxRequests = Math.max(maxRequests, chunkState.requests)
                  }
                }

                orderedPotentialNextModules.push([
                  nextModule,
                  size,
                  nextChunkStates,
                  maxRequests,
                ] as const)
              }
              orderedPotentialNextModules.sort(
                (a, b) =>
                  b[3] - a[3] ||
                  (a[0].identifier() < b[0].identifier() ? -1 : 1)
              )

              // Try every potential module
              loop: for (const [
                nextModule,
                size,
                nextChunkStates,
              ] of orderedPotentialNextModules) {
                if (currentSize + size > MAX_CSS_CHUNK_SIZE) {
                  // Chunk would be too large
                  continue
                }
                if (!strict) {
                  // In loose mode we only check if the dependencies are not violated
                  const dependent = allDependents.get(nextModule)
                  if (dependent) {
                    for (const dep of dependent) {
                      if (newChunkModules.has(dep)) {
                        // A dependent of the module is already in the chunk, which would violate the order
                        continue loop
                      }
                    }
                  }
                } else {
                  // In strict mode we check that none of the order in any chunk is changed by adding the module
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
                }

                // Global CSS must not leak into unrelated chunks
                const nextIsGlobalCss = isGlobalCss(nextModule)
                if (nextIsGlobalCss && globalCssMode) {
                  if (allChunkStates.size !== nextChunkStates.size) {
                    // Fast check
                    continue
                  }
                }
                if (globalCssMode) {
                  for (const chunkState of nextChunkStates.keys()) {
                    if (!allChunkStates.has(chunkState)) {
                      // Global CSS would leak into chunkState
                      continue loop
                    }
                  }
                }
                if (nextIsGlobalCss) {
                  for (const chunkState of allChunkStates.keys()) {
                    if (!nextChunkStates.has(chunkState)) {
                      // Global CSS would leak into chunkState
                      continue loop
                    }
                  }
                }
                potentialNextModules.delete(nextModule)
                currentSize += size
                if (nextIsGlobalCss) {
                  globalCssMode = true
                }
                for (const [chunkState, i] of nextChunkStates) {
                  if (allChunkStates.has(chunkState)) {
                    // This reduces the request count of the chunk group
                    chunkState.requests--
                  }
                  allChunkStates.set(chunkState, i)
                  const newNextModule = chunkState.modules[i + 1]
                  if (
                    newNextModule &&
                    remainingModules.has(newNextModule) &&
                    !newChunkModules.has(newNextModule)
                  ) {
                    potentialNextModules.set(newNextModule, [
                      newNextModule.size(),
                      chunkStatesByModule.get(newNextModule)!,
                    ])
                  }
                }
                newChunkModules.add(nextModule)
                cont = true
                break
              }
            } while (cont)
            const newChunk = compilation.addChunk()
            newChunk.preventIntegration = true
            newChunk.idNameHints.add('css')
            for (const module of newChunkModules) {
              remainingModules.delete(module)
              chunkGraph.connectChunkAndModule(newChunk, module)
              newChunksByModule.set(module, newChunk)
            }
            changed = true
          }

          for (const { chunk, modules } of chunkStates.values()) {
            const chunks = new Set()
            for (const module of modules) {
              const newChunk = newChunksByModule.get(module)
              if (newChunk) {
                chunkGraph.disconnectChunkAndModule(chunk, module)
                if (chunks.has(newChunk)) continue
                chunks.add(newChunk)
                chunk.split(newChunk)
              }
            }
          }

          if (summary) {
            console.log('Top 20 chunks by request count:')
            const orderedChunkStates = [...chunkStates.values()]
            orderedChunkStates.sort((a, b) => b.requests - a.requests)
            for (const { chunk, modules, requests } of orderedChunkStates.slice(
              0,
              20
            )) {
              console.log(
                `- ${requests} requests for ${chunk.name} (has ${modules.length} modules)`
              )
            }
          }

          return changed
        }
      )
    })
  }
}
