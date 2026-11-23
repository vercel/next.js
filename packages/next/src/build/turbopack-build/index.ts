import path from 'path'
import { NextBuildContext } from '../build-context'
import type { Telemetry } from '../../telemetry/storage'
import { turbopackBuild as turbopackBuildImpl } from './impl'
import { Worker } from '../../lib/worker'
import { exportTraceState, recordTraceEvents } from '../../trace'
import type { Span } from '../../trace'

type TurbopackBuildResult = Awaited<ReturnType<typeof turbopackBuildImpl>>

// Span ids are a per-process counter. The build worker continues counting
// from this far above the parent's counter, so the ids it allocates can't
// collide with the ones the parent allocates in the meantime.
const WORKER_SPAN_ID_OFFSET = 2 ** 31

/**
 * Runs the Turbopack compilation in a child process
 * (`experimental.turbopackBuildWorker`). When the child exits after
 * persisting the Turbopack cache, all of its memory is returned to the OS, and
 * the parent process stays small, which makes forking the static generation
 * workers cheap.
 *
 * The child is spawned as early as possible, so that starting Node.js and
 * loading the modules and native bindings overlaps with the work the parent
 * does before the compilation.
 */
export class TurbopackBuildWorker {
  private readonly worker: Worker & typeof import('./worker')
  private readonly prepared: Promise<void>
  // Settles once Turbopack in the worker has shut down (persisted its cache).
  private shutdown: Promise<void> | undefined
  private ending: Promise<void> | undefined

  constructor({ useWasmBinary }: { useWasmBinary: boolean }) {
    this.worker = new Worker(path.join(__dirname, 'worker.js'), {
      exposedMethods: ['prepare', 'workerMain', 'waitForShutdown'],
      debuggerPortOffset: -1,
      isolatedMemory: false,
      numWorkers: 1,
      maxRetries: 0,
      forkOptions: {
        env: {
          NEXT_PRIVATE_BUILD_WORKER: '1',
          NEXT_PRIVATE_TURBOPACK_BUILD_WORKER: '1',
          ...(process.env.NEXT_CPU_PROF
            ? {
                NEXT_CPU_PROF: '1',
                NEXT_CPU_PROF_DIR: process.env.NEXT_CPU_PROF_DIR,
                __NEXT_PRIVATE_CPU_PROFILE: 'build-turbopack',
              }
            : undefined),
        },
      },
    }) as Worker & typeof import('./worker')
    this.prepared = this.worker.prepare(useWasmBinary)
    // Awaited (and rethrown) in `build()`. Don't report it as unhandled if the
    // build fails before it gets there.
    this.prepared.catch(() => {})
  }

  async build(
    telemetry: Telemetry,
    runTurbopackSpan: Span
  ): Promise<TurbopackBuildResult> {
    const {
      // Not serializable, the worker creates its own span.
      nextBuildSpan: _nextBuildSpan,
      // Not serializable, loaded again in the worker.
      config: _config,
      // Not serializable, events are recorded with `telemetry` instead.
      telemetry: _telemetry,
      ...buildContext
    } = NextBuildContext

    try {
      await this.prepared
      const traceState = exportTraceState()
      const result = await this.worker.workerMain({
        buildContext,
        env: process.env,
        traceState: {
          ...traceState,
          lastId: traceState.lastId + WORKER_SPAN_ID_OFFSET,
          shouldSaveTraceEvents: true,
        },
        parentSpanId: runTurbopackSpan.getId(),
        telemetryEnabled: telemetry.isEnabled,
      })
      for (const events of result.telemetryEvents) {
        telemetry.record(events)
      }

      // The worker keeps running while Turbopack persists its cache. End it
      // once that's done, so its memory is released.
      this.shutdown = this.recordWorkerTraceAfterShutdown()
      const shutdownPromise = this.shutdown.finally(() => this.end())
      // Awaited at the end of the build. Don't report it as unhandled if the
      // build fails before that.
      shutdownPromise.catch(() => {})

      return {
        duration: result.duration,
        buildTraceContext: undefined,
        shutdownPromise,
        warnings: result.warnings,
      }
    } catch (err) {
      // Same as the in-process build, wait for Turbopack to shut down (it
      // already did when the compilation failed) before reporting the error.
      await this.recordWorkerTraceAfterShutdown().catch(() => {})
      await this.end()
      throw restoreWorkerError(err)
    }
  }

  private async recordWorkerTraceAfterShutdown(): Promise<void> {
    const { traceEvents } = await this.worker.waitForShutdown()
    recordTraceEvents(traceEvents)
  }

  /**
   * Ends the worker process. If the compilation has finished, this first
   * waits for Turbopack to finish persisting its cache, so a build that fails
   * later doesn't cut that short. Safe to call more than once.
   */
  end(): Promise<void> {
    this.ending ??= (async () => {
      await this.shutdown?.catch(() => {})
      await this.worker.end()
    })()
    return this.ending
  }
}

/**
 * jest-worker recreates errors thrown in the worker as `Error` instances with
 * the original message, stack and enumerable properties, plus a `type`
 * property. Remove that and restore the `cause` (see `worker.ts`), so the error
 * is reported the same way as when compiling in this process.
 */
function restoreWorkerError(err: unknown): unknown {
  if (!(err instanceof Error)) return err
  const error = err as Error & { type?: unknown }
  delete error.type
  const { cause } = error
  if (
    cause !== null &&
    typeof cause === 'object' &&
    'message' in cause &&
    typeof cause.message === 'string'
  ) {
    const restored = new Error(cause.message)
    if ('name' in cause && typeof cause.name === 'string') {
      restored.name = cause.name
    }
    restored.stack = 'stack' in cause ? String(cause.stack) : undefined
    Object.defineProperty(error, 'cause', {
      value: restored,
      enumerable: false,
      configurable: true,
      writable: true,
    })
  }
  return error
}

export function turbopackBuild(
  telemetry: Telemetry,
  worker: TurbopackBuildWorker | undefined
): Promise<TurbopackBuildResult> {
  const nextBuildSpan = NextBuildContext.nextBuildSpan!
  return nextBuildSpan
    .traceChild('run-turbopack')
    .traceAsyncFn((span) =>
      worker ? worker.build(telemetry, span) : turbopackBuildImpl(telemetry)
    )
}
