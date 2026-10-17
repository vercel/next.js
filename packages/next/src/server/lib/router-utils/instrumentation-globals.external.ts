import path from 'node:path'
import isError from '../../../lib/is-error'
import { INSTRUMENTATION_HOOK_FILENAME } from '../../../lib/constants'
import type {
  InstrumentationModule,
  InstrumentationOnRequestError,
} from '../../instrumentation/types'
import { interopDefault } from '../../../lib/interop-default'
import { afterRegistration as extendInstrumentationAfterRegistration } from './instrumentation-node-extensions'
import { getTracer, SpanStatusCode } from '../trace/tracer'
import { InstrumentationSpan } from '../trace/constants'

let cachedInstrumentationModule: InstrumentationModule
let instrumentationModuleLoadTiming: InstrumentationSpanTiming | undefined

type InstrumentationSpanTiming = {
  startTime: number
  endTime: number
  error?: unknown
}

/** A lifecycle span of `instrumentation.ts`, recorded to be emitted later. */
type InstrumentationLifecycleSpan = {
  type: InstrumentationSpan
  spanName: string
  timing: InstrumentationSpanTiming
}

function getInstrumentationTimestamp() {
  // Date.now() is treated as synchronous I/O while Cache Components render.
  return performance.timeOrigin + performance.now()
}

function traceBackdatedInstrumentationSpan({
  type,
  spanName,
  timing: { startTime, endTime, error },
}: InstrumentationLifecycleSpan) {
  getTracer().trace(
    type,
    { spanName, startTime, endTime },
    error === undefined
      ? () => undefined
      : (span) => {
          span?.recordException(error as Error)
          if (isError(error)) {
            span?.setAttribute('error.type', error.name)
          }
          span?.setStatus({
            code: SpanStatusCode.ERROR,
            message: isError(error) ? error.message : undefined,
          })
        }
  )
}

/**
 * Takes the recorded timing of loading the instrumentation module, if not
 * emitted yet, as a lifecycle span.
 */
function takeInstrumentationModuleLoadSpan():
  | InstrumentationLifecycleSpan
  | undefined {
  if (!instrumentationModuleLoadTiming) return undefined

  const timing = instrumentationModuleLoadTiming
  instrumentationModuleLoadTiming = undefined
  return {
    type: InstrumentationSpan.loadModule,
    spanName: 'load instrumentation module',
    timing,
  }
}

function traceInstrumentationModuleLoad() {
  const span = takeInstrumentationModuleLoadSpan()
  if (span) {
    traceBackdatedInstrumentationSpan(span)
  }
}

export async function getInstrumentationModule(
  projectDir: string,
  distDir: string
): Promise<InstrumentationModule | undefined> {
  if (cachedInstrumentationModule) {
    return cachedInstrumentationModule
  }

  const startTime = getInstrumentationTimestamp()
  let error: unknown
  try {
    cachedInstrumentationModule = interopDefault(
      await require(
        path.join(
          projectDir,
          distDir,
          'server',
          `${INSTRUMENTATION_HOOK_FILENAME}.js`
        )
      )
    )
    return cachedInstrumentationModule
  } catch (err: unknown) {
    if (
      isError(err) &&
      err.code !== 'ENOENT' &&
      err.code !== 'MODULE_NOT_FOUND' &&
      err.code !== 'ERR_MODULE_NOT_FOUND'
    ) {
      error = err
      throw err
    }
  } finally {
    instrumentationModuleLoadTiming ??= {
      startTime,
      endTime: getInstrumentationTimestamp(),
      error,
    }
  }
}

let instrumentationModulePromise: Promise<any> | null = null

/**
 * Loads `instrumentation.ts` and calls its `register()`.
 *
 * Its lifecycle spans (`load instrumentation module`, `register
 * instrumentation`) are backdated and emitted afterwards, since `register()`
 * commonly installs the tracer provider. They are emitted right away in the
 * active context, unless `deferredSpans` is given: then successfully completed
 * steps are added to it instead, for the caller to emit in another context
 * (the request that triggered registration). Failed steps are always emitted
 * right away.
 */
async function registerInstrumentation(
  projectDir: string,
  distDir: string,
  deferredSpans?: InstrumentationLifecycleSpan[]
) {
  // Ensure registerInstrumentation is not called in production build
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return
  }
  if (!instrumentationModulePromise) {
    instrumentationModulePromise = getInstrumentationModule(projectDir, distDir)
  }
  let instrumentation: InstrumentationModule | undefined
  try {
    instrumentation = await instrumentationModulePromise
  } catch (err) {
    // A load error is only exportable when a provider was already installed.
    traceInstrumentationModuleLoad()
    throw err
  }
  if (instrumentation?.register) {
    const startTime = getInstrumentationTimestamp()
    let error: unknown
    let registered = false
    try {
      await instrumentation.register()
      extendInstrumentationAfterRegistration()
      registered = true
    } catch (err: any) {
      error = err
      err.message = `An error occurred while loading instrumentation hook: ${err.message}`
      throw err
    } finally {
      const endTime = getInstrumentationTimestamp()

      // register() commonly installs the provider, so emit both lifecycle
      // spans afterward with their original timestamps.
      const spans = [
        takeInstrumentationModuleLoadSpan(),
        {
          type: InstrumentationSpan.register,
          spanName: 'register instrumentation',
          timing: { startTime, endTime, error },
        },
      ].filter((span) => span !== undefined)
      // Only defer after a successful registration: a failing request has no
      // request span to emit them in.
      if (deferredSpans && registered) {
        deferredSpans.push(...spans)
      } else {
        spans.forEach(traceBackdatedInstrumentationSpan)
      }
    }
  } else {
    const span = takeInstrumentationModuleLoadSpan()
    if (span) {
      if (deferredSpans) {
        deferredSpans.push(span)
      } else {
        traceBackdatedInstrumentationSpan(span)
      }
    }
  }
}

export async function instrumentationOnRequestError(
  projectDir: string,
  distDir: string,
  ...args: Parameters<InstrumentationOnRequestError>
) {
  const instrumentation = await getInstrumentationModule(projectDir, distDir)
  try {
    await instrumentation?.onRequestError?.(...args)
  } catch (err) {
    // Log the soft error and continue, since the original error has already been thrown
    console.error('Error in instrumentation.onRequestError:', err)
  }
}

let registerInstrumentationPromise: Promise<void> | null = null
export function ensureInstrumentationRegistered(
  projectDir: string,
  distDir: string
) {
  if (!registerInstrumentationPromise) {
    registerInstrumentationPromise = registerInstrumentation(
      projectDir,
      distDir
    )
  }
  return registerInstrumentationPromise
}

/**
 * Like `ensureInstrumentationRegistered`, for a request that may trigger
 * registration (direct entrypoints, without next-server). When this call
 * starts registration and it succeeds, the lifecycle spans aren't emitted yet:
 * the returned function emits them in the context it's called in, so they can
 * become children of the request's span. Returns `undefined` when
 * registration was already started by another caller.
 */
export async function ensureInstrumentationRegisteredForRequest(
  projectDir: string,
  distDir: string
): Promise<(() => void) | undefined> {
  if (registerInstrumentationPromise) {
    await registerInstrumentationPromise
    return undefined
  }

  const deferredSpans: InstrumentationLifecycleSpan[] = []
  registerInstrumentationPromise = registerInstrumentation(
    projectDir,
    distDir,
    deferredSpans
  )
  await registerInstrumentationPromise
  if (deferredSpans.length === 0) {
    return undefined
  }
  return () => {
    // Emit at most once.
    deferredSpans.splice(0).forEach(traceBackdatedInstrumentationSpan)
  }
}
