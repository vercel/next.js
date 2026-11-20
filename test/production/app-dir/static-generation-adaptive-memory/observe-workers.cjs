const Module = require('module')
const { appendFileSync } = require('fs')
const { join } = require('path')
const { totalmem } = require('os')
const v8 = require('v8')

const observations = join(__dirname, 'worker-memory-observations.jsonl')
const record = (value) =>
  appendFileSync(observations, `${JSON.stringify(value)}\n`)
const originalLoad = Module._load
const instrumented = new Map()

// Keep the real worker pool, probes, scheduler, and page rendering. Only the
// memory sensors read by a probe are controlled: each worker reports retained
// allocations equal to 45% of the machine budget, without allocating them.
Module._load = function (request, parent, isMain) {
  const exports = originalLoad.call(this, request, parent, isMain)
  if (!exports || typeof exports !== 'object') return exports
  if (
    !exports.Worker &&
    !exports.getStaticWorkerMemoryUsage &&
    !exports.runAdaptiveStaticGeneration
  ) {
    return exports
  }

  const filename = Module._resolveFilename(request, parent).replaceAll(
    '\\',
    '/'
  )
  if (instrumented.has(filename)) return instrumented.get(filename)

  let replacement
  if (filename.endsWith('/next/dist/lib/worker.js')) {
    replacement = {
      ...exports,
      Worker: class extends exports.Worker {
        constructor(workerPath, options) {
          super(workerPath, options)
          if (!options.exposedMethods.includes('getStaticWorkerMemoryUsage')) {
            return
          }

          record({ kind: 'pool', size: options.numWorkers })
          const probe = this.getStaticWorkerMemoryUsage.bind(this)
          let round = 0
          let pendingProbes = []
          this.getStaticWorkerMemoryUsage = async (input) => {
            if (input.slot === 0) {
              round++
              pendingProbes = []
            }
            const currentRound = round
            const currentProbes = pendingProbes
            const pending = probe(input)
            currentProbes.push(pending)
            const result = await pending
            record({
              kind: 'probe',
              round: currentRound,
              slot: input.slot,
              ...result,
            })
            if (input.slot === 0) {
              // Let all workers finish their ordinary probes first, so an
              // unpinned call cannot keep choosing the only idle worker.
              await Promise.all(currentProbes)
              // Repeated calls must stay on the same physical worker. Two
              // extra calls distinguish pinning from coincidental round-robin
              // alignment after the three ordinary pool probes.
              for (let i = 0; i < 2; i++) {
                const repeated = await probe(input)
                record({
                  kind: 'pin',
                  round: currentRound,
                  slot: 0,
                  ...repeated,
                })
              }
            }
            return result
          }

          const step = this.exportPagesAdaptive.bind(this)
          this.exportPagesAdaptive = async (input) => {
            const result = await step(input)
            record({
              kind: 'step',
              phase: input.phase,
              slot: input.slot,
              workerId: result.workerId,
              rssLimit: input.limits.rssLimit,
              submitted: input.submit.length,
            })
            return result
          }
        }
      },
    }
  } else if (filename.endsWith('/next/dist/export/worker.js')) {
    replacement = {
      ...exports,
      getStaticWorkerMemoryUsage(input) {
        const {
          getConstrainedMemory,
        } = require('next/dist/export/static-generation-profile')
        const retained = Math.ceil(
          (getConstrainedMemory() ?? totalmem()) * 0.45
        )
        const getHeapStatistics = v8.getHeapStatistics
        const getRss = process.memoryUsage.rss
        v8.getHeapStatistics = () => ({
          ...getHeapStatistics(),
          used_heap_size: retained,
          external_memory: 0,
        })
        process.memoryUsage.rss = () => retained
        try {
          // The real probe reads both sensors synchronously before returning
          // its promise. Restore them before any rendering or timer can run.
          return exports.getStaticWorkerMemoryUsage(input)
        } finally {
          v8.getHeapStatistics = getHeapStatistics
          process.memoryUsage.rss = getRss
        }
      },
    }
  } else if (filename.endsWith('/next/dist/export/adaptive/orchestrator.js')) {
    replacement = {
      ...exports,
      runAdaptiveStaticGeneration(options) {
        record({
          kind: 'phase',
          phase: options.phase,
          slots: options.numSlots,
          machineMemoryLimit: options.machineMemoryLimit,
          idleAllocated: options.memory.getIdleAllocated?.(),
          idleRss: options.memory.getIdleRss?.(),
        })
        return exports.runAdaptiveStaticGeneration(options)
      },
    }
  }

  if (replacement) {
    instrumented.set(filename, replacement)
    return replacement
  }
  return exports
}
