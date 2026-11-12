import { performance, PerformanceObserver } from 'perf_hooks'
import v8 from 'v8'
import { isMainThread } from 'worker_threads'
import type { MemorySnapshot } from './worker-session'

const GC_FLOOR_WINDOW = 10

/**
 * Samples event loop utilization and memory for the admission controller.
 * Each `read()` reports utilization since the previous `read()`.
 */
export class MemoryMonitor {
  private lastElu = performance.eventLoopUtilization()
  private postGcHeap: number | undefined
  private recentPostGc: number[] = []
  private observer: PerformanceObserver | undefined

  constructor() {
    try {
      this.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          // NODE_PERFORMANCE_GC_MAJOR = 4, NODE_PERFORMANCE_GC_INCREMENTAL = 8
          const kind = (entry as any).detail?.kind ?? (entry as any).kind
          if (kind === 4 || kind === 8) {
            const used = v8.getHeapStatistics().used_heap_size
            this.postGcHeap = used
            this.recentPostGc.push(used)
            if (this.recentPostGc.length > GC_FLOOR_WINDOW) {
              this.recentPostGc.shift()
            }
          }
        }
      })
      this.observer.observe({ entryTypes: ['gc'] })
    } catch {
      // Without GC events the controller falls back to live heap usage.
    }
  }

  read(): MemorySnapshot {
    const elu = performance.eventLoopUtilization(this.lastElu)
    this.lastElu = performance.eventLoopUtilization()
    const heap = v8.getHeapStatistics()
    const memory = process.memoryUsage()
    return {
      elu: elu.utilization,
      heapUsed: heap.used_heap_size,
      heapLimit: heap.heap_size_limit,
      // In worker thread mode RSS belongs to the whole build process, not
      // this worker, so it can't be compared to a per-worker budget.
      rss: isMainThread ? memory.rss : 0,
      // RSS rarely shrinks after a burst: freed memory stays mapped and is
      // reused before the process grows again. Track what is actually
      // allocated (JS heap plus memory held by buffers) instead, so a worker
      // that freed memory can take pages again.
      liveRss: heap.used_heap_size + memory.external,
      postGcHeap: this.postGcHeap,
      postGcFloor: this.recentPostGc.length
        ? Math.min(...this.recentPostGc)
        : undefined,
    }
  }

  dispose(): void {
    this.observer?.disconnect()
  }
}
