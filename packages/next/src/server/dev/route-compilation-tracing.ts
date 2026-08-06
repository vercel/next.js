import type { AsyncLocalStorage } from 'async_hooks'
import type { Span } from 'next/dist/compiled/@opentelemetry/api'
import { PageNotFoundError } from '../../shared/lib/utils'
import { DevBundlerServiceSpan, type SpanTypes } from '../lib/trace/constants'
import {
  createOneShotTracePhase,
  isInternalTracingEnabled,
} from '../lib/trace/phase'
import { getTracer } from '../lib/trace/tracer'

let compileRouteAsyncStorage: AsyncLocalStorage<Span> | undefined

class ExpectedRouteResolutionMiss {
  constructor(readonly error: PageNotFoundError) {}
}

type CompileRouteOutcome<T> =
  | { kind: 'result'; value: T }
  | { kind: 'resolution-miss'; error: PageNotFoundError }

function getCompileRouteAsyncStorage(): AsyncLocalStorage<Span> {
  if (!compileRouteAsyncStorage) {
    const { createAsyncLocalStorage } =
      require('../app-render/async-local-storage') as typeof import('../app-render/async-local-storage')
    compileRouteAsyncStorage = createAsyncLocalStorage()
  }
  return compileRouteAsyncStorage
}

async function runCompileRouteOperation<T>(
  operation: () => Promise<T>
): Promise<CompileRouteOutcome<T>> {
  try {
    return { kind: 'result', value: await operation() }
  } catch (error) {
    if (error instanceof ExpectedRouteResolutionMiss) {
      return { kind: 'resolution-miss', error: error.error }
    }
    throw error
  }
}

export async function traceCompileRoute<T>(
  operation: () => Promise<T>
): Promise<T> {
  if (!isInternalTracingEnabled()) {
    return await operation()
  }

  const outcome = await getTracer().trace(
    DevBundlerServiceSpan.ensurePage,
    { spanName: 'compile route' },
    (compileRouteSpan) =>
      compileRouteSpan
        ? getCompileRouteAsyncStorage().run(compileRouteSpan, () =>
            runCompileRouteOperation(operation)
          )
        : runCompileRouteOperation(operation)
  )

  if (outcome.kind === 'resolution-miss') {
    throw outcome.error
  }
  return outcome.value
}

function getCompileRouteParentSpan() {
  if (!isInternalTracingEnabled()) {
    return undefined
  }

  const compileRouteSpan = compileRouteAsyncStorage?.getStore()
  const activeSpan = getTracer().getActiveScopeSpan()
  if (!compileRouteSpan || !activeSpan) {
    return undefined
  }

  const compileRouteContext = compileRouteSpan.spanContext()
  const activeContext = activeSpan.spanContext()
  return compileRouteContext.traceId === activeContext.traceId &&
    compileRouteContext.spanId === activeContext.spanId
    ? compileRouteSpan
    : undefined
}

export async function traceCompileRoutePhase<T>(
  type: SpanTypes,
  spanName: string,
  operation: () => Promise<T>
): Promise<T> {
  const parentSpan = getCompileRouteParentSpan()

  // These phases describe work within `compile route`. An unrelated active
  // span or direct route probe must not become their owner.
  if (!parentSpan) {
    return await operation()
  }

  return await getTracer().trace(type, { spanName, parentSpan }, operation)
}

export async function traceCompileRouteResolution<T>(
  operation: () => Promise<T>
): Promise<T> {
  if (!getCompileRouteParentSpan()) {
    return await operation()
  }

  const finishResolution = createOneShotTracePhase(
    DevBundlerServiceSpan.resolveRoute,
    'resolve route'
  )

  try {
    const result = await operation()
    finishResolution()
    return result
  } catch (error) {
    // Candidate-route misses are normal dev-server control flow. Do not emit a
    // failed child for a probe that its caller is expected to catch.
    if (error instanceof PageNotFoundError) {
      finishResolution()
      throw new ExpectedRouteResolutionMiss(error)
    } else {
      finishResolution({ error })
      throw error
    }
  }
}
