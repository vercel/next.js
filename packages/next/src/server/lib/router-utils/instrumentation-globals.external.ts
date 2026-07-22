import path from 'node:path'
import isError from '../../../lib/is-error'
import { INSTRUMENTATION_HOOK_FILENAME } from '../../../lib/constants'
import type {
  InstrumentationModule,
  InstrumentationOnRequestError,
} from '../../instrumentation/types'
import { interopDefault } from '../../../lib/interop-default'
import { afterRegistration as extendInstrumentationAfterRegistration } from './instrumentation-node-extensions'

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
    try {
      await instrumentation.register()
      // After register() the user's SDK has armed require-in-the-middle hooks.
      // Built-in modules loaded before register() (e.g. `http`, `https` imported
      // by start-server.ts at module top-level) are already in the require cache
      // and will never be re-required naturally, so OpenTelemetry
      // HttpInstrumentation never gets a chance to patch them.
      // process.getBuiltinModule() (Node >= 20.16) re-triggers pending hooks for
      // already-loaded built-in modules without any observable side effects.
      // See: https://github.com/vercel/next.js/issues/95894
      touchBuiltinModulesForInstrumentation()
      extendInstrumentationAfterRegistration()
    } catch (err: any) {
      err.message = `An error occurred while loading instrumentation hook: ${err.message}`
      throw err
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
 * Re-triggers require-in-the-middle hooks for built-in modules that may have
 * been loaded before instrumentation.register() was called.
 *
 * OpenTelemetry's HttpInstrumentation (and other built-in module
 * instrumentations) patch modules via require-in-the-middle, which intercepts
 * Module.prototype.require. If `http`/`https` are already in the require cache
 * when the hook is armed inside register(), no future require() call will flow
 * through the hook and the patch is never applied — making HttpInstrumentation
 * silently ineffective for all incoming requests.
 *
 * process.getBuiltinModule() (Node >= 20.16) causes the module system to pass
 * the already-loaded built-in through any registered require hooks, applying
 * pending patches without any observable side effects on older call sites.
 *
 * Graceful degradation: on Node < 20.16 the function is a no-op. Users on
 * older Node versions can work around the issue via
 * NODE_OPTIONS="--require ./otel-preload.cjs".
 */
export function touchBuiltinModulesForInstrumentation(): void {
  if (typeof (process as any).getBuiltinModule !== 'function') {
    // Node < 20.16 — process.getBuiltinModule is not available.
    return
  }
  // Touch the built-in modules most commonly instrumented by OTel and similar
  // libraries. getBuiltinModule() is synchronous and has no side effects beyond
  // triggering pending require hooks.
  const builtins = ['http', 'https', 'net', 'dns'] as const
  for (const mod of builtins) {
    ;(process as any).getBuiltinModule(mod)
  }
}
