// Import cpu-profile first to start profiling early if enabled
import '../../server/lib/cpu-profile'
import { NextBuildContext } from '../build-context'
import { PHASE_PRODUCTION_BUILD } from '../../shared/lib/constants'
import loadConfig from '../../server/config'
import { installBindings } from '../swc/install-bindings'
import { Bundler } from '../../lib/bundler'
import { getTraceEvents, initializeTraceState, trace } from '../../trace'
import type { SpanId, TraceEvent, TraceState } from '../../trace'
import type { TelemetryEvent } from '../../telemetry/storage'
import { turbopackBuild, type TurbopackBuildTelemetry } from './impl'

// This module is the entry point of the child process that runs the Turbopack
// compilation of `next build` when `experimental.turbopackBuildWorker` is
// enabled. See `./index.ts` for the parent side.

// If the parent process goes away (e.g. it was killed), stop compiling
// instead of continuing as an orphan.
process.once('disconnect', () => process.exit(1))

/**
 * Environment variables the build worker is started with that are specific to
 * this process, so they are kept when the parent's environment is applied.
 */
const WORKER_PRIVATE_ENV_KEYS = new Set([
  // Sanitized for the worker by `lib/worker.ts` (e.g. without `--inspect`).
  'NODE_OPTIONS',
  'IS_NEXT_WORKER',
  'FORCE_COLOR',
  'NEXT_PRIVATE_BUILD_WORKER',
  'NEXT_PRIVATE_TURBOPACK_BUILD_WORKER',
  // CPU profiling of the worker itself, see `server/lib/cpu-profile.ts`.
  'NEXT_CPU_PROF',
  'NEXT_CPU_PROF_DIR',
  '__NEXT_PRIVATE_CPU_PROFILE',
])

/**
 * Makes `process.env` match the parent's environment, which can have changed
 * since this process was started.
 */
function applyParentEnv(env: NodeJS.ProcessEnv) {
  for (const key of Object.keys(process.env)) {
    if (!WORKER_PRIVATE_ENV_KEYS.has(key) && !(key in env)) {
      delete process.env[key]
    }
  }
  for (const [key, value] of Object.entries(env)) {
    if (!WORKER_PRIVATE_ENV_KEYS.has(key) && value !== undefined) {
      process.env[key] = value
    }
  }
}

/**
 * Errors are sent to the parent through JSON, which drops the non-enumerable
 * `cause`. Make it enumerable and serializable, so the parent can restore it.
 */
function prepareErrorForParent(err: unknown): unknown {
  if (err instanceof Error && err.cause !== undefined) {
    const { cause } = err
    Object.defineProperty(err, 'cause', {
      value:
        cause instanceof Error
          ? { name: cause.name, message: cause.message, stack: cause.stack }
          : cause,
      enumerable: true,
      configurable: true,
      writable: true,
    })
  }
  return err
}

let shutdownPromise: Promise<void> = Promise.resolve()

/**
 * Called right after the worker is spawned, so loading the modules and the
 * native bindings overlaps with the work the parent does before compiling.
 */
export async function prepare(useWasmBinary: boolean): Promise<void> {
  await installBindings(useWasmBinary)
}

export type TurbopackBuildWorkerResult = {
  duration: number
  warnings: string[]
  telemetryEvents: (TelemetryEvent | TelemetryEvent[])[]
}

export async function workerMain(workerData: {
  buildContext: Partial<typeof NextBuildContext>
  env: NodeJS.ProcessEnv
  traceState: TraceState
  parentSpanId: SpanId
  telemetryEnabled: boolean
}): Promise<TurbopackBuildWorkerResult> {
  applyParentEnv(workerData.env)
  Object.assign(NextBuildContext, workerData.buildContext)
  initializeTraceState(workerData.traceState)

  // Spans of this worker, including Turbopack's compilation events, are
  // recorded as descendants of this span.
  const workerSpan = trace('turbopack-build-worker', workerData.parentSpanId)
  NextBuildContext.nextBuildSpan = workerSpan

  try {
    // The config isn't serializable (it can contain functions and RegExps),
    // so load it again.
    const config = await loadConfig(
      PHASE_PRODUCTION_BUILD,
      NextBuildContext.dir!,
      {
        debugPrerender: NextBuildContext.debugPrerender,
        reactProductionProfiling: NextBuildContext.reactProductionProfiling,
        bundler: Bundler.Turbopack,
      }
    )
    NextBuildContext.config = config
    await installBindings(config.experimental?.useWasmBinary)

    const telemetryEvents: TurbopackBuildWorkerResult['telemetryEvents'] = []
    const telemetry: TurbopackBuildTelemetry = {
      isEnabled: workerData.telemetryEnabled,
      record: async (events) => {
        telemetryEvents.push(events)
        return { isFulfilled: true, isRejected: false }
      },
    }

    const result = await turbopackBuild(telemetry)
    shutdownPromise = result.shutdownPromise
    // Reported to the parent by `waitForShutdown()`.
    shutdownPromise.catch(() => {})
    return {
      duration: result.duration,
      warnings: result.warnings,
      telemetryEvents,
    }
  } catch (err) {
    throw prepareErrorForParent(err)
  } finally {
    workerSpan.stop()
  }
}

/**
 * Resolves once Turbopack has persisted its cache and shut down. Returns the
 * trace events recorded in this worker, so the parent can write them.
 */
export async function waitForShutdown(): Promise<{
  traceEvents: TraceEvent[]
}> {
  await shutdownPromise
  // Writes to the stdio pipes are asynchronous. Flush what was logged during
  // shutdown before the parent ends this process.
  await Promise.all(
    [process.stdout, process.stderr].map(
      (stream) =>
        new Promise<void>((resolve) => stream.write('', () => resolve()))
    )
  )
  return { traceEvents: getTraceEvents() }
}
