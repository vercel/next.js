import { runAdaptiveStaticGeneration } from './orchestrator'
import { AdaptiveWorkerSession, type MemorySnapshot } from './worker-session'
import { createAdmissionConfig } from './admission-controller'
import type {
  AdaptiveSessionInput,
  AdaptiveStepInput,
  AdaptiveStepResult,
  AdaptiveTaskInput,
} from './types'
import type { ExportPathEntry } from '../types'

const MB = 1024 * 1024
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function workerError(message: string) {
  return Object.assign(new Error(message), { type: 'WorkerError' })
}

type FakeWorkerBehavior = {
  /** ms to render a page. */
  renderMs?: (path: string) => number
  /** Throwing from here simulates the worker process dying mid-page. */
  onPageStart?: (path: string, worker: FakeWorker) => void
  memory?: () => Partial<MemorySnapshot>
}

/**
 * Simulates one jest-worker child: one step call at a time, session state
 * that is lost when the process "restarts", and a new id after a restart.
 */
class FakeWorker {
  generation = 0
  session: AdaptiveWorkerSession | undefined
  sessionId: string | undefined
  rendered: Array<{ path: string; workerId: string; placement?: string }> = []
  restarts = 0
  private crash: ((err: Error) => void) | undefined
  maxRunning = 0
  running = 0

  constructor(
    readonly slot: number,
    readonly behavior: FakeWorkerBehavior = {}
  ) {}

  get workerId() {
    return `fake-${this.slot}-${this.generation}`
  }

  restart() {
    this.generation++
    this.restarts++
    this.session = undefined
    this.sessionId = undefined
    this.running = 0
    const crash = this.crash
    this.crash = undefined
    crash?.(workerError('Jest worker encountered 1 child process exceptions'))
  }

  step(input: AdaptiveStepInput): Promise<AdaptiveStepResult> {
    return new Promise<AdaptiveStepResult>((resolve, reject) => {
      this.crash = reject
      if (input.recycleWorkerId === this.workerId) {
        this.restart()
        return
      }
      if (!this.session || this.sessionId !== input.sessionId) {
        if (!input.session) {
          resolve({
            workerId: this.workerId,
            needsSession: true,
            results: [],
            refused: input.submit.map((task) => task.id),
            status: {
              workerId: this.workerId,
              running: 0,
              queued: 0,
              capacity: 0,
              concurrency: 0,
              saturated: false,
              elu: 0,
              rss: 0,
              rawRss: 0,
              heapUsed: 0,
              heapLimit: 0,
              memoryUsage: 0,
              memoryPerPage: undefined,
              postGcFloor: undefined,
            },
          })
          return
        }
        const generation = this.generation
        this.sessionId = input.sessionId
        this.session = new AdaptiveWorkerSession({
          workerId: this.workerId,
          config: createAdmissionConfig({
            maxConcurrency: input.limits.maxConcurrency,
          }),
          now: () => Date.now(),
          readMemory: () => ({
            elu: 0.1,
            heapUsed: 100 * MB,
            rss: 200 * MB,
            liveRss: 200 * MB,
            heapLimit: 1000 * MB,
            postGcHeap: 100 * MB,
            postGcFloor: 100 * MB,
            ...this.behavior.memory?.(),
          }),
          exportPage: async (task: AdaptiveTaskInput) => {
            this.running++
            this.maxRunning = Math.max(this.maxRunning, this.running)
            try {
              this.behavior.onPageStart?.(task.exportPath.path, this)
              await sleep(this.behavior.renderMs?.(task.exportPath.path) ?? 1)
              if (this.generation !== generation) {
                // The process died; this render never reports back.
                return new Promise<never>(() => {})
              }
              this.rendered.push({
                path: task.exportPath.path,
                workerId: this.workerId,
                placement: task.placement,
              })
              return {
                path: task.exportPath.path,
                page: task.exportPath.page,
                pageKey: task.exportPath.path,
                result: { cacheControl: undefined, duration: 1 } as any,
              }
            } finally {
              this.running--
            }
          },
        })
      }
      const session = this.session
      const generation = this.generation
      session.tick()
      session.step(input).then(
        (result) => {
          if (this.generation === generation) resolve(result)
        },
        (err) => {
          if (this.generation === generation) reject(err)
        }
      )
    })
  }
}

const exportPaths = (count: number, prefix = '/p'): ExportPathEntry[] =>
  Array.from({ length: count }, (_, i) => ({
    page: `${prefix}/[id]`,
    path: `${prefix}/${i}`,
  }))

function run(
  workers: FakeWorker[],
  paths: ExportPathEntry[],
  overrides: Partial<Parameters<typeof runAdaptiveStaticGeneration>[0]> = {}
) {
  const logs: string[] = []
  const promise = runAdaptiveStaticGeneration({
    exportPaths: paths,
    phase: 'initial',
    sessionId: 'session-1',
    session: {} as AdaptiveSessionInput,
    getPageKey: (exportPath) => exportPath.path,
    numSlots: workers.length,
    initialSlots: workers.length,
    chunkSize: 5,
    maxConcurrency: undefined,
    machineMemoryLimit: 16 * 1024 * MB,
    getParentRss: () => 100 * MB,
    callStep: (slot, input) => workers[slot].step(input),
    log: (message) => logs.push(message),
    ...overrides,
  })
  return { promise, logs }
}

describe('runAdaptiveStaticGeneration', () => {
  it('renders every page once and returns results in input order', async () => {
    const workers = [new FakeWorker(0), new FakeWorker(1), new FakeWorker(2)]
    const paths = exportPaths(100)
    const { promise } = run(workers, paths)
    const results = await promise
    expect(results.map((r) => r.path)).toEqual(paths.map((p) => p.path))
    const rendered = workers.flatMap((w) => w.rendered.map((r) => r.path))
    expect(rendered.sort()).toEqual(paths.map((p) => p.path).sort())
  })

  it('spreads a run of slow pages across workers', async () => {
    const slow = (path: string) => (Number(path.split('/')[2]) >= 40 ? 30 : 1)
    const workers = [
      new FakeWorker(0, { renderMs: slow }),
      new FakeWorker(1, { renderMs: slow }),
    ]
    const { promise } = run(workers, exportPaths(60))
    await promise
    const slowCount = (w: FakeWorker) =>
      w.rendered.filter((r) => Number(r.path.split('/')[2]) >= 40).length
    expect(slowCount(workers[0])).toBeGreaterThan(3)
    expect(slowCount(workers[1])).toBeGreaterThan(3)
  })

  it('reroutes pages a saturated worker refuses', async () => {
    const workers = [
      // Worker 0 is over its memory high-water mark.
      new FakeWorker(0, { memory: () => ({ heapUsed: 800 * MB }) }),
      new FakeWorker(1),
    ]
    const { promise } = run(workers, exportPaths(40))
    await promise
    // The saturated worker only ever takes one page at a time.
    expect(workers[0].maxRunning).toBe(1)
    expect(workers[1].rendered.length).toBeGreaterThan(
      workers[0].rendered.length
    )
    expect(
      workers[1].rendered.some((r) => r.placement?.startsWith('refused-by-'))
    ).toBe(true)
  })

  it('retries pages from a crashed worker one at a time', async () => {
    let crashed = false
    const crashOnce = (path: string, worker: FakeWorker) => {
      if (path === '/p/7' && !crashed) {
        crashed = true
        setTimeout(() => worker.restart(), 0)
      }
    }
    const workers = [
      new FakeWorker(0, { onPageStart: crashOnce, renderMs: () => 3 }),
      new FakeWorker(1, { onPageStart: crashOnce, renderMs: () => 3 }),
    ]
    const { promise, logs } = run(workers, exportPaths(30))
    const results = await promise
    expect(results.map((r) => r.path)).toEqual(
      exportPaths(30).map((p) => p.path)
    )
    expect(logs.some((l) => l.includes('crashed build worker'))).toBe(true)
    const retried = workers
      .flatMap((w) => w.rendered)
      .filter((r) => r.placement === 'retry-after-crashed')
    expect(retried.map((r) => r.path)).toContain('/p/7')
  })

  it('fails the build when a page keeps crashing workers', async () => {
    const alwaysCrash = (path: string, worker: FakeWorker) => {
      if (path === '/p/3') setTimeout(() => worker.restart(), 0)
    }
    const workers = [
      new FakeWorker(0, { onPageStart: alwaysCrash }),
      new FakeWorker(1, { onPageStart: alwaysCrash }),
    ]
    const { promise } = run(workers, exportPaths(10))
    await expect(promise).rejects.toThrow(
      'Static generation failed: rendering "/p/3" crashed the build worker 3 times.'
    )
  })

  it('recycles a worker whose post-GC heap keeps creeping up', async () => {
    let floor = 100
    const workers = [
      new FakeWorker(0, {
        memory: () => {
          floor += 5
          return { postGcFloor: floor * MB, heapUsed: 150 * MB }
        },
      }),
    ]
    const { promise, logs } = run(workers, exportPaths(300))
    const results = await promise
    expect(results).toHaveLength(300)
    expect(workers[0].restarts).toBeGreaterThan(0)
    expect(logs.some((l) => l.startsWith('Recycling static worker'))).toBe(true)
  })

  it('re-sends the session to a worker that restarted between steps', async () => {
    const workers = [new FakeWorker(0)]
    let restarted = false
    const { promise } = run(workers, exportPaths(40), {
      callStep: (slot, input) => {
        if (!restarted && input.submit.some((t) => t.id === 20)) {
          restarted = true
          // Restart while idle: the next step reaches a fresh process.
          workers[slot].generation++
          workers[slot].session = undefined
        }
        return workers[slot].step(input)
      },
    })
    const results = await promise
    expect(results).toHaveLength(40)
  })

  it('fails on unexpected errors from the page export', async () => {
    const workers = [new FakeWorker(0)]
    const { promise } = run(workers, exportPaths(5), {
      callStep: async () => {
        throw new Error('boom')
      },
    })
    await expect(promise).rejects.toThrow('boom')
  })

  it('honors a configured max concurrency', async () => {
    const workers = [new FakeWorker(0, { renderMs: () => 5 })]
    const { promise } = run(workers, exportPaths(50), { maxConcurrency: 3 })
    await promise
    expect(workers[0].maxRunning).toBeLessThanOrEqual(3)
  })
})
