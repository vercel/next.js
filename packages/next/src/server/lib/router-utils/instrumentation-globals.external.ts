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

export async function getInstrumentationModule(
  projectDir: string,
  distDir: string
): Promise<InstrumentationModule | undefined> {
  if (cachedInstrumentationModule) {
    return cachedInstrumentationModule
  }

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
      throw err
    }
  }
}

let instrumentationModulePromise: Promise<any> | null = null

async function registerInstrumentation(projectDir: string, distDir: string) {
  // Ensure registerInstrumentation is not called in production build
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return
  }
  if (!instrumentationModulePromise) {
    instrumentationModulePromise = getInstrumentationModule(projectDir, distDir)
  }
  const instrumentation = await instrumentationModulePromise
  if (instrumentation?.register) {
    const startTime = Date.now()
    let error: unknown
    try {
      await instrumentation.register()
      extendInstrumentationAfterRegistration()
    } catch (err: any) {
      error = err
      err.message = `An error occurred while loading instrumentation hook: ${err.message}`
      throw err
    } finally {
      // Emitted after `register()` so a provider installed inside the hook is
      // in place. The span is backdated to cover the full hook duration.
      const span = getTracer().startSpan(InstrumentationSpan.register, {
        startTime,
        spanName: 'instrumentation register',
      })
      if (error) {
        span.recordException(error as Error)
        span.setStatus({ code: SpanStatusCode.ERROR })
      }
      span.end()
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
