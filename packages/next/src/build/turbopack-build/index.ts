import path from 'path'
import { NextBuildContext } from '../build-context'
import type { Telemetry } from '../../telemetry/storage'
import {
  turbopackBuild as turbopackBuildImpl,
  type TurbopackBuildProject,
  type TurbopackBuildProjectHost,
} from './impl'
import { Worker } from '../../lib/worker/index'
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
    this.prepared = this.worker.prepare(useWasmBinary)
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
    const result = await this.call(() =>
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
      })
    )

    const project: TurbopackBuildProject = {
      writeAllEntrypointsToDisk: async (appDirOnly) => {
        let written = await this.call(() =>
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
      featureUsage: () => this.call(() => this.worker.featureUsage()),
      writeAnalyzeData: (appDirOnly) =>
        this.call(() => this.worker.writeAnalyzeData(appDirOnly)),
      shutdown: () => {
        this.shutdown ??= this.call(() => this.worker.shutdownProject()).then(
          ({ traceEvents }) => recordTraceEvents(traceEvents)
        )
        return this.shutdown
      },
    }
    return { ...result, value: project }
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
      written = await this.call(() =>
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

  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn()
    } catch (err) {
      throw restoreWorkerError(err)
    }
  }

  /**
   * Ends the worker process. If the project was created, this first waits for
   * Turbopack to finish persisting its cache, so a build that fails later
   * doesn't cut that short. Safe to call more than once.
   */
  end(): Promise<void> {
    this.ending ??= (async () => {
      await this.shutdown?.catch(() => {})
      await this.worker.shutdown()
    })()
    return this.ending
  }
}

/**
 * The worker pool recreates errors thrown in the worker as `Error` instances with
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
