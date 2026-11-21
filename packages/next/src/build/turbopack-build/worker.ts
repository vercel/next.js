// Import cpu-profile first to start profiling early if enabled
import '../../server/lib/cpu-profile'
import { getBindingsSync } from '../swc'
import { installBindings } from '../swc/install-bindings'
import { getTraceEvents, initializeTraceState, trace } from '../../trace'
import type { Span, SpanId, TraceEvent, TraceState } from '../../trace'
import type {
  BuildFeatureUsage,
  Project,
  TurboEngineOptions,
  TurbopackResult,
} from '../swc/types'
import type { NapiProjectOptions } from '../swc/generated-native'
import { backgroundLogCompilationEvents } from '../../shared/lib/turbopack/compilation-events'
import {
  entrypointsToTransferable,
  type TransferableEntrypoints,
} from './transfer'

// This module is the entry point of the child process that hosts the native
// Turbopack project of `next build` when `experimental.turbopackBuildWorker`
// is enabled. It only runs the native calls; the main process does everything
// else, including loading the config and serializing the project options for
// the native code. See `./index.ts` for the main process side.

// If the main process goes away (e.g. it was killed), stop compiling instead
// of continuing as an orphan.
process.once('disconnect', () => process.exit(1))

/**
 * Errors are sent to the main process through JSON, which drops the
 * non-enumerable `cause`. Make it enumerable and serializable, so the main
 * process can restore it.
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

async function forParent<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    throw prepareErrorForParent(err)
  }
}

let project: Project | undefined
let workerSpan: Span | undefined
let compilationEvents: Promise<void> = Promise.resolve()
const compilationEventsController = new AbortController()
let shutdownPromise: Promise<void> | undefined

function getProject(): Project {
  if (!project) {
    throw new Error('The Turbopack project has not been created')
  }
  return project
}

/**
 * `onBeforeDeferredEntries` runs in the main process, which has the config.
 * When Turbopack calls it, the pending call from the main process returns
 * early, the main process runs the callback, and then calls
 * `continueAfterDeferredEntries()` to let Turbopack continue.
 */
let deferredEntriesCallback:
  | {
      reached: Promise<void>
      onReached: () => void
      resume: (error: unknown) => void
    }
  | undefined

function setupDeferredEntriesCallback(): () => Promise<void> {
  let onReached!: () => void
  const reached = new Promise<void>((resolve) => {
    onReached = resolve
  })
  let resume!: (error: unknown) => void
  const resumed = new Promise<void>((resolve, reject) => {
    resume = (error) => (error === undefined ? resolve() : reject(error))
  })
  deferredEntriesCallback = { reached, onReached, resume }
  return () => {
    onReached()
    return resumed
  }
}

/**
 * Called right after the worker is spawned, so loading the modules and the
 * native bindings overlaps with the work the main process does before
 * compiling.
 */
export async function prepare(useWasmBinary: boolean): Promise<void> {
  await installBindings(useWasmBinary)
}

export function createProject(data: {
  options: NapiProjectOptions
  turboEngineOptions: TurboEngineOptions
  hasOnBeforeDeferredEntries: boolean
  traceState: TraceState
  parentSpanId: SpanId
}): Promise<Omit<TurbopackResult<unknown>, 'value'>> {
  return forParent(async () => {
    initializeTraceState(data.traceState)
    // Spans of this worker, including Turbopack's compilation events, are
    // recorded as descendants of this span.
    workerSpan = trace('turbopack-build-worker', data.parentSpanId)

    const { value, ...result } =
      await getBindingsSync().turbo.createProjectFromSerializedOptions(
        withWorkerNodeOptions(data.options),
        data.turboEngineOptions,
        data.hasOnBeforeDeferredEntries
          ? { onBeforeDeferredEntries: setupDeferredEntriesCallback() }
          : undefined
      )
    project = value
    compilationEvents = backgroundLogCompilationEvents(value, {
      parentSpan: workerSpan,
      signal: compilationEventsController.signal,
    })
    return result
  })
}

/**
 * Node.js processes started by Turbopack (e.g. for webpack loaders) get the
 * project's environment, which comes from the main process. Give them the
 * Node.js options of this worker instead, which the worker pool derived from
 * the main process's options without debugger flags, so they don't open an
 * inspector the main process didn't ask for.
 */
function withWorkerNodeOptions(
  options: NapiProjectOptions
): NapiProjectOptions {
  const env = options.env.filter(({ name }) => name !== 'NODE_OPTIONS')
  const nodeOptions = process.env.NODE_OPTIONS
  if (nodeOptions) {
    env.push({ name: 'NODE_OPTIONS', value: nodeOptions })
  }
  return { ...options, env }
}

export type WriteAllEntrypointsToDiskResult =
  | { type: 'done'; entrypoints: TransferableEntrypoints }
  | { type: 'before-deferred-entries' }

let pendingWriteAllEntrypoints:
  | Promise<WriteAllEntrypointsToDiskResult>
  | undefined

export function writeAllEntrypointsToDisk(
  appDirOnly: boolean
): Promise<WriteAllEntrypointsToDiskResult> {
  return forParent(async () => {
    const written = getProject()
      .writeAllEntrypointsToDisk(appDirOnly)
      .then(
        (entrypoints): WriteAllEntrypointsToDiskResult => ({
          type: 'done',
          entrypoints: entrypointsToTransferable(entrypoints),
        })
      )
    if (!deferredEntriesCallback) {
      return written
    }
    pendingWriteAllEntrypoints = written
    // Don't report it as unhandled while the main process runs the callback.
    written.catch(() => {})
    return Promise.race([
      written,
      deferredEntriesCallback.reached.then(
        (): WriteAllEntrypointsToDiskResult => ({
          type: 'before-deferred-entries',
        })
      ),
    ])
  })
}

/**
 * Lets Turbopack continue after the main process ran `onBeforeDeferredEntries`
 * and returns the result of `writeAllEntrypointsToDisk`. When the callback
 * failed, `error` is passed back to Turbopack and the call rejects.
 */
export function continueAfterDeferredEntries(
  error: { message: string; stack?: string } | undefined
): Promise<WriteAllEntrypointsToDiskResult> {
  return forParent(async () => {
    if (!deferredEntriesCallback || !pendingWriteAllEntrypoints) {
      throw new Error('Turbopack is not waiting for onBeforeDeferredEntries')
    }
    let callbackError: Error | undefined
    if (error) {
      callbackError = new Error(error.message)
      callbackError.stack = error.stack
    }
    deferredEntriesCallback.resume(callbackError)
    return pendingWriteAllEntrypoints
  })
}

export function featureUsage(): Promise<BuildFeatureUsage[]> {
  return forParent(() => getProject().featureUsage())
}

export function writeAnalyzeData(
  appDirOnly: boolean
): Promise<TurbopackResult<void>> {
  return forParent(() => getProject().writeAnalyzeData(appDirOnly))
}

/**
 * Shuts Turbopack down (which persists its cache) and returns the trace events
 * recorded in this worker, so the main process can write them.
 */
export function shutdownProject(): Promise<{ traceEvents: TraceEvent[] }> {
  return forParent(async () => {
    shutdownPromise ??= (async () => {
      await project?.shutdown()
      // Shutdown flushes and closes the compilation event queue, so the
      // subscription ends once final events (e.g. persistence, compaction
      // trace spans) have been delivered. The timeout is only a backstop
      // against a subscription that never closes.
      await Promise.race([
        compilationEvents,
        new Promise((resolve) => setTimeout(resolve, 10_000).unref()),
      ])
      compilationEventsController.abort()
      await compilationEvents
      workerSpan?.stop()
    })()
    await shutdownPromise
    // Writes to the stdio pipes are asynchronous. Flush what was logged during
    // shutdown before the main process ends this process.
    await Promise.all(
      [process.stdout, process.stderr].map(
        (stream) =>
          new Promise<void>((resolve) => stream.write('', () => resolve()))
      )
    )
    return { traceEvents: getTraceEvents() }
  })
}
