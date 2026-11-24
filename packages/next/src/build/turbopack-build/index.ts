import path from 'path'
import { NextBuildContext } from '../build-context'
import type { Telemetry } from '../../telemetry/storage'
import {
  turbopackBuild as turbopackBuildImpl,
  type TurbopackBuildProject,
  type TurbopackBuildProjectHost,
} from './impl'
import { Worker, WorkerExitError } from '../../lib/worker/index'
import { exportTraceState, recordTraceEvents } from '../../trace'
import type { Span } from '../../trace'
import { getBindingsSync } from '../swc'
import type {
  ProjectOptions,
  TurboEngineOptions,
  TurbopackProjectCallbacks,
  TurbopackResult,
} from '../swc/types'
import { entrypointsFromTransferable } from './transfer'
import type { WriteAllEntrypointsToDiskResult } from './worker'

type TurbopackBuildResult = Awaited<ReturnType<typeof turbopackBuildImpl>>

// Span ids are a per-process counter. The build worker continues counting
// from this far above the main process's counter, so the ids it allocates
// can't collide with the ones the main process allocates in the meantime.
const WORKER_SPAN_ID_OFFSET = 2 ** 31

/**
 * Hosts the native Turbopack project of `next build` in a child process
 * (`experimental.turbopackBuildWorker`). Only the native calls run in the
 * child; everything else, including loading the config, stays in this
 * process. When the child exits after persisting the Turbopack cache, all of
 * its memory is returned to the OS, and this process stays small, which makes
 * forking the static generation workers cheap.
 *
 * The child is spawned as early as possible, so that starting Node.js and
 * loading the modules and native bindings overlaps with the work this process
 * does before the compilation. It inherits the environment at that time; the
 * build's environment is also passed to the project explicitly.
 */
export class TurbopackBuildWorker implements TurbopackBuildProjectHost {
  private readonly worker: Worker & typeof import('./worker')
  private readonly prepared: Promise<void>
  // Settles once Turbopack in the worker has shut down (persisted its cache).
  private shutdown: Promise<void> | undefined
  private ending: Promise<void> | undefined
  private runTurbopackSpan: Span | undefined
  // Set when a call failed because the worker exited (e.g. it crashed). The
  // pool would start a new worker for further calls, which has no project.
  private exited = false

  constructor({ useWasmBinary }: { useWasmBinary: boolean }) {
    this.worker = new Worker(path.join(__dirname, 'worker.js'), {
      exposedMethods: [
        'prepare',
        'createProject',
        'writeAllEntrypointsToDisk',
        'continueAfterDeferredEntries',
        'featureUsage',
        'writeAnalyzeData',
        'shutdownProject',
      ],
      workerName: 'Next.js Turbopack build worker',
      // Must stay a child process, never a worker thread: the point of the
      // worker is that all of Turbopack's (native) memory is returned to the
      // OS when it exits, and that this process stays small so forking the
      // static generation workers is cheap. A thread shares this process's
      // heap, allocator and native runtime, so its memory would stay here.
      enableWorkerThreads: false,
      maxWorkers: 1,
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
    this.prepared = this.track(this.worker.prepare(useWasmBinary))
    // Awaited (and rethrown) in `createProject()`. Don't report it as
    // unhandled if the build fails before it gets there.
    this.prepared.catch(() => {})
  }

  /** Called by `turbopackBuild()` within its `run-turbopack` span. */
  setParentSpan(span: Span) {
    this.runTurbopackSpan = span
  }

  async createProject(
    options: ProjectOptions,
    turboEngineOptions: TurboEngineOptions,
    callbacks: TurbopackProjectCallbacks | undefined
  ): Promise<TurbopackResult<TurbopackBuildProject>> {
    // Serialized here, where the config is loaded: the worker never loads it.
    const serializedOptions =
      await getBindingsSync().turbo.serializeProjectOptions(options)
    await this.prepared
    const traceState = exportTraceState()
    const result = await this.track(
      this.worker.createProject({
        options: serializedOptions,
        turboEngineOptions,
        hasOnBeforeDeferredEntries: !!callbacks?.onBeforeDeferredEntries,
        traceState: {
          ...traceState,
          lastId: traceState.lastId + WORKER_SPAN_ID_OFFSET,
          shouldSaveTraceEvents: true,
        },
        parentSpanId: (
          this.runTurbopackSpan ?? NextBuildContext.nextBuildSpan!
        ).getId(),
        distDir: NextBuildContext.distDir!,
      })
    )

    const project: TurbopackBuildProject = {
      writeAllEntrypointsToDisk: async (appDirOnly) => {
        let written = await this.track(
          this.worker.writeAllEntrypointsToDisk(appDirOnly)
        )
        if (written.type === 'before-deferred-entries') {
          written = await this.runOnBeforeDeferredEntries(callbacks)
        }
        if (written.type !== 'done') {
          throw new Error('Turbopack stopped before writing all entrypoints')
        }
        return entrypointsFromTransferable(written.entrypoints)
      },
      featureUsage: () => this.track(this.worker.featureUsage()),
      writeAnalyzeData: (appDirOnly) =>
        this.track(this.worker.writeAnalyzeData(appDirOnly)),
      shutdown: () => this.shutdownProject(),
    }
    return { ...result, value: project }
  }

  private track<T>(call: Promise<T>): Promise<T> {
    return call.catch((err) => {
      if (err instanceof WorkerExitError) {
        this.exited = true
      }
      throw err
    })
  }

  /**
   * Shuts Turbopack in the worker down (persisting its cache) and records the
   * worker's trace events here. Safe to call more than once, and when the
   * project wasn't created. Does nothing if the worker exited.
   */
  private shutdownProject(): Promise<void> {
    this.shutdown ??= this.exited
      ? Promise.resolve()
      : this.track(this.worker.shutdownProject()).then(({ traceEvents }) =>
          recordTraceEvents(traceEvents)
        )
    return this.shutdown
  }

  /**
   * Turbopack in the worker is waiting for `onBeforeDeferredEntries`. Run it
   * here, where the config is loaded, and let the worker continue.
   */
  private async runOnBeforeDeferredEntries(
    callbacks: TurbopackProjectCallbacks | undefined
  ): Promise<WriteAllEntrypointsToDiskResult> {
    let callbackFailure: { error: unknown } | undefined
    try {
      await callbacks?.onBeforeDeferredEntries?.()
    } catch (error) {
      callbackFailure = { error }
    }
    // Always let the worker continue, so it doesn't wait forever. When the
    // callback failed, Turbopack receives the error and stops compiling.
    let written: WriteAllEntrypointsToDiskResult
    try {
      written = await this.track(
        this.worker.continueAfterDeferredEntries(
          callbackFailure &&
            (callbackFailure.error instanceof Error
              ? {
                  message: callbackFailure.error.message,
                  stack: callbackFailure.error.stack,
                }
              : { message: String(callbackFailure.error) })
        )
      )
    } catch (err) {
      if (callbackFailure) throw callbackFailure.error
      throw err
    }
    if (callbackFailure) throw callbackFailure.error
    return written
  }

  /**
   * Ends the worker process. This first lets the worker shut Turbopack down,
   * so a build that fails later doesn't cut persisting the cache short, and
   * so the worker sends its telemetry events, e.g. of a Turbopack internal
   * error while creating the project. Safe to call more than once.
   */
  end(): Promise<void> {
    this.ending ??= (async () => {
      await this.shutdownProject().catch(() => {})
      await this.worker.shutdown()
    })()
    return this.ending
  }
}

export async function turbopackBuild(
  telemetry: Telemetry,
  worker: TurbopackBuildWorker | undefined
): Promise<TurbopackBuildResult> {
  const nextBuildSpan = NextBuildContext.nextBuildSpan!
  return nextBuildSpan
    .traceChild('run-turbopack')
    .traceAsyncFn(async (span) => {
      if (!worker) {
        return turbopackBuildImpl(telemetry, undefined)
      }
      worker.setParentSpan(span)
      try {
        const result = await turbopackBuildImpl(telemetry, worker)
        // The worker keeps running while Turbopack persists its cache. End it
        // once that's done, so its memory is released.
        const shutdownPromise = result.shutdownPromise.finally(() =>
          worker.end()
        )
        // Awaited at the end of the build. Don't report it as unhandled if the
        // build fails before that.
        shutdownPromise.catch(() => {})
        return { ...result, shutdownPromise }
      } catch (err) {
        // `turbopackBuild()` already shut the project down.
        await worker.end()
        throw err
      }
    })
}
