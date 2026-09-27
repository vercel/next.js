import type { AppPageModule } from './route-modules/app-page/module'
import { workAsyncStorage } from './app-render/work-async-storage.external'

export type ClientComponentLoaderMetrics = {
  clientComponentLoadStart: number
  clientComponentLoadEnd: number
  clientComponentLoadTimes: number
  clientComponentLoadCount: number
}

/** Metrics owned by one render, including chunks that settle after rendering. */
export class ClientComponentLoadTracker {
  private clientComponentLoadStart = 0
  private clientComponentLoadEnd = 0
  private clientComponentLoadTimes = 0
  private clientComponentLoadCount = 0
  private hasLoads = false
  private pending = 0
  private sealed = false
  private finalizationRegistered = false
  private completion:
    | Promise<ClientComponentLoaderMetrics | undefined>
    | undefined = undefined
  private resolveCompletion:
    | ((metrics: ClientComponentLoaderMetrics | undefined) => void)
    | undefined = undefined

  isSealed(): boolean {
    return this.sealed
  }

  registerFinalization(): boolean {
    if (this.finalizationRegistered) return false
    this.finalizationRegistered = true
    return true
  }

  beginRequire(startTime: number): void {
    this.recordStart(startTime)
    this.clientComponentLoadCount++
    this.pending++
  }

  finishRequire(startTime: number, endTime: number): void {
    this.recordSettlement(startTime, endTime)
  }

  beginChunk(startTime: number): void {
    this.recordStart(startTime)
    this.pending++
  }

  finishChunk(startTime: number, endTime: number): void {
    this.recordSettlement(startTime, endTime)
  }

  snapshot(): ClientComponentLoaderMetrics | undefined {
    if (!this.hasLoads) {
      return undefined
    }

    return {
      clientComponentLoadStart: this.clientComponentLoadStart,
      clientComponentLoadEnd: this.clientComponentLoadEnd,
      clientComponentLoadTimes: this.clientComponentLoadTimes,
      clientComponentLoadCount: this.clientComponentLoadCount,
    }
  }

  seal(): Promise<ClientComponentLoaderMetrics | undefined> {
    if (this.completion !== undefined) {
      return this.completion
    }

    this.sealed = true
    if (this.pending === 0) {
      this.completion = Promise.resolve(this.snapshot())
    } else {
      this.completion = new Promise((resolve) => {
        this.resolveCompletion = resolve
      })
    }
    return this.completion
  }

  private recordStart(startTime: number): void {
    if (!this.hasLoads) {
      this.hasLoads = true
      this.clientComponentLoadStart = startTime
    }
  }

  private recordSettlement(startTime: number, endTime: number): void {
    this.clientComponentLoadEnd = endTime
    this.clientComponentLoadTimes += endTime - startTime
    this.pending--

    if (this.sealed && this.pending === 0 && this.resolveCompletion) {
      const resolve = this.resolveCompletion
      this.resolveCompletion = undefined
      resolve(this.snapshot())
    }
  }
}

/** Seal without keeping waitUntil open for pending chunks. */
export function finalizeClientComponentLoadTracker(
  tracker: ClientComponentLoadTracker,
  report: (metrics: ClientComponentLoaderMetrics | undefined) => void
): void {
  if (!tracker.registerFinalization()) return
  void tracker
    .seal()
    .then(report)
    .catch((error) => {
      // Telemetry is best-effort; a reporting failure must not reject an
      // unobserved promise after the request has closed.
      console.error('Failed to report client component loading metrics:', error)
    })
}

/** Finish a dynamic render when its Web Stream pipe settles. */
export function finalizeClientComponentLoadTrackerOnStream(
  source: ReadableStream<Uint8Array>,
  tracker: ClientComponentLoadTracker,
  report: (metrics: ClientComponentLoaderMetrics | undefined) => void
): ReadableStream<Uint8Array> {
  const bridge = new TransformStream<Uint8Array, Uint8Array>()
  // pipeTo propagates source errors and consumer cancellation through the
  // bridge. Observe its settlement independently so telemetry cannot change
  // the stream's result or create an unhandled rejection.
  void source
    .pipeTo(bridge.writable)
    .finally(() => finalizeClientComponentLoadTracker(tracker, report))
    .catch(() => {})
  return bridge.readable
}

/** Finish a prerender after it has produced its result or thrown. */
export async function finalizeClientComponentLoadTrackerOnPrerender<T>(
  operation: () => Promise<T>,
  tracker: ClientComponentLoadTracker,
  report: (metrics: ClientComponentLoaderMetrics | undefined) => void
): Promise<T> {
  try {
    return await operation()
  } finally {
    finalizeClientComponentLoadTracker(tracker, report)
  }
}

export function wrapClientComponentLoader(
  ComponentMod: AppPageModule
): AppPageModule['__next_app__'] {
  if (!('performance' in globalThis)) {
    return ComponentMod.__next_app__
  }

  return {
    require: (...args) => {
      const tracker = workAsyncStorage.getStore()?.clientComponentLoadTracker
      if (tracker === undefined || tracker.isSealed()) {
        return ComponentMod.__next_app__.require(...args)
      }

      const startTime = performance.now()
      tracker.beginRequire(startTime)
      try {
        return ComponentMod.__next_app__.require(...args)
      } finally {
        tracker.finishRequire(startTime, performance.now())
      }
    },
    loadChunk: (...args) => {
      const tracker = workAsyncStorage.getStore()?.clientComponentLoadTracker
      if (tracker === undefined || tracker.isSealed()) {
        return ComponentMod.__next_app__.loadChunk(...args)
      }

      const startTime = performance.now()
      tracker.beginChunk(startTime)
      let result: ReturnType<AppPageModule['__next_app__']['loadChunk']>
      try {
        result = ComponentMod.__next_app__.loadChunk(...args)
      } catch (error) {
        tracker.finishChunk(startTime, performance.now())
        throw error
      }

      // React can depend on the original promise identity.
      const onSettled = () => {
        tracker.finishChunk(startTime, performance.now())
      }
      result.then(onSettled, onSettled)
      return result
    },
  }
}

export function getClientComponentLoaderMetrics(
  options: { reset?: boolean } = {}
): ClientComponentLoaderMetrics | undefined {
  const workStore = workAsyncStorage.getStore()
  const tracker = workStore?.clientComponentLoadTracker
  const metrics = tracker?.snapshot()

  if (options.reset && workStore) {
    // Pending settlements still hold their original tracker. Detaching it only
    // affects subsequent reads and loads in this render.
    workStore.clientComponentLoadTracker = undefined
  }

  return metrics
}
