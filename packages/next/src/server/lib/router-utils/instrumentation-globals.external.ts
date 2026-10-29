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

function getInstrumentationTimestamp() {
  // Date.now() is treated as synchronous I/O while Cache Components render.
  return performance.timeOrigin + performance.now()
}

function traceBackdatedInstrumentationSpan(
  type: InstrumentationSpan,
  spanName: string,
  { startTime, endTime, error }: InstrumentationSpanTiming
) {
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

function traceInstrumentationModuleLoad() {
  if (!instrumentationModuleLoadTiming) return

  const timing = instrumentationModuleLoadTiming
  instrumentationModuleLoadTiming = undefined
  traceBackdatedInstrumentationSpan(
    InstrumentationSpan.loadModule,
    'load instrumentation module',
    timing
  )
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
 * Lifecycle spans are backdated and emitted afterward, since registration
 * commonly installs the application's tracer provider.
 */
async function registerInstrumentation(
  projectDir: string,
  distDir: string,
  forToolingBuild = false
) {
  // Only the explicit, gated coordinator entry point may register during build.
  if (process.env.NEXT_PHASE === 'phase-production-build' && !forToolingBuild) {
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
    try {
      await instrumentation.register()
      extendInstrumentationAfterRegistration()
    } catch (err: any) {
      error = err
      err.message = `An error occurred while loading instrumentation hook: ${err.message}`
      throw err
    } finally {
      const endTime = getInstrumentationTimestamp()

      // register() commonly installs the provider, so emit both lifecycle
      // spans afterward with their original timestamps.
      traceInstrumentationModuleLoad()
      traceBackdatedInstrumentationSpan(
        InstrumentationSpan.register,
        'register instrumentation',
        { startTime, endTime, error }
      )
    }
  } else {
    traceInstrumentationModuleLoad()
  }
  if (
    process.env.NEXT_EXPERIMENTAL_OTEL_TOOLING === '1' &&
    (process.env.__NEXT_DEV_SERVER || forToolingBuild)
  ) {
    const { enableReporting } =
      require('../../../trace/otel') as typeof import('../../../trace/otel')
    enableReporting(instrumentation?.flushTraces?.bind(instrumentation))
  }
}

let toolingBuildRegistration: Promise<void> | undefined
/** Coordinator-only: register this build's entry or drain without a hook. */
export function registerToolingBuildInstrumentation(
  projectDir: string,
  distDir: string,
  hasInstrumentationHook: boolean
) {
  if (process.env.NEXT_EXPERIMENTAL_OTEL_TOOLING !== '1') return
  toolingBuildRegistration ??= (async () => {
    const previousRuntime = process.env.NEXT_RUNTIME
    process.env.NEXT_RUNTIME = 'nodejs'
    try {
      if (hasInstrumentationHook) {
        await registerInstrumentation(
          projectDir,
          path.relative(projectDir, distDir),
          true
        )
      } else {
        // cleanDistDir:false can leave an old emitted entry behind. Only the
        // current build's detected source entry may register application code.
        const { enableReporting } =
          require('../../../trace/otel') as typeof import('../../../trace/otel')
        enableReporting()
      }
    } finally {
      if (previousRuntime === undefined) delete process.env.NEXT_RUNTIME
      else process.env.NEXT_RUNTIME = previousRuntime
    }
  })()
  return toolingBuildRegistration
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
