import type { AppPageModule } from './route-modules/app-page/module'
import type { Readable } from 'node:stream'
import type { AnyStream } from './app-render/app-render-prerender-utils'
import { workAsyncStorage } from './app-render/work-async-storage.external'
import { trackStreamCompletion } from './stream-utils/track-stream-completion'

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
  private streamingBound = false
  private resolveCompletion:
    | ((metrics: ClientComponentLoaderMetrics | undefined) => void)
    | undefined = undefined

  constructor(
    private readonly report: (
      metrics: ClientComponentLoaderMetrics | undefined
    ) => void = () => {}
  ) {}

  isSealed(): boolean {
    return this.sealed
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

  /** Keep this render open through consumption of its final output stream. */
  bindToStream(stream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array>
  bindToStream(stream: Readable): Readable
  bindToStream(stream: AnyStream): AnyStream
  bindToStream(stream: AnyStream): AnyStream {
    if (stream instanceof ReadableStream && stream.locked) return stream

    try {
      const output = trackStreamCompletion(stream, () => this.finish())
      this.streamingBound = true
      return output
    } catch {
      // A tracking failure must not replace the response or prevent fallback
      // finalization at the render entrypoint.
      return stream
    }
  }

  finishIfNotStreaming(): void {
    if (!this.streamingBound) this.finish()
  }

  /** Stop accepting new loads and report after any in-flight loads settle. */
  finish(): void {
    if (this.sealed) return
    this.sealed = true
    let completion: Promise<ClientComponentLoaderMetrics | undefined>
    if (this.pending === 0) {
      completion = Promise.resolve(this.snapshot())
    } else {
      completion = new Promise((resolve) => {
        this.resolveCompletion = resolve
      })
    }

    // Telemetry is best-effort and must not keep the response open or mask a
    // render error, including when reporting fails.
    void completion.then(this.report).catch((error) => {
      console.error('Failed to report client component loading metrics:', error)
    })
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
