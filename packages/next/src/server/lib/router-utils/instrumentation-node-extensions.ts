/**
 * This extension augments opentelemetry after registration if applicable.
 * This extension must only be loaded in Node environments.
 */

import type {
  ProxyTracerProvider,
  Span,
  Tracer,
  TracerProvider,
} from '@opentelemetry/api'
import { workUnitAsyncStorage } from '../../app-render/work-unit-async-storage.external'
import { InvariantError } from '../../../shared/lib/invariant-error'
import { isUseCacheFunction } from '../../../lib/client-and-server-references'

export function afterRegistration(): void {
  if (process.env.NEXT_RUNTIME === 'edge') {
    throw new InvariantError(
      'Node.js instrumentation extensions should not be loaded in the Edge runtime.'
    )
  }

  extendTracerProviderForCacheComponents()
}

function isProxyTracerProvider(
  provider: TracerProvider
): provider is ProxyTracerProvider {
  return (
    'getDelegateTracer' in provider &&
    typeof provider.getDelegateTracer === 'function'
  )
}

// In theory we only want to enable this extension when cacheComponents is enabled
// however there are certain servers that might load instrumentation before nextConfig is available
// and so gating it on the config might lead to skipping this extension even when it is necessary.
// When cacheComponents is disabled this extension should be a no-op so we enable it universally.
// Additionally, soon, cacheComponents will be enabled always so this just pulls the extension forward in time
function extendTracerProviderForCacheComponents(): void {
  let api: typeof import('next/dist/compiled/@opentelemetry/api')

  // we want to allow users to use their own version of @opentelemetry/api if they
  // want to, so we try to require it first, and if it fails we fall back to the
  // version that is bundled with Next.js
  // this is because @opentelemetry/api has to be synced with the version of
  // @opentelemetry/tracing that is used, and we don't want to force users to use
  // the version that is bundled with Next.js.
  // the API is ~stable, so this should be fine
  try {
    api = require('@opentelemetry/api') as typeof import('@opentelemetry/api')
  } catch (err) {
    api =
      require('next/dist/compiled/@opentelemetry/api') as typeof import('next/dist/compiled/@opentelemetry/api')
  }

  const provider = api.trace.getTracerProvider()

  // When Cache Components is enabled we need to instrument the tracer
  // to exit the workUnitAsyncStorage context when creating and ending spans.
  const originalGetTracer = provider.getTracer.bind(provider)
  provider.getTracer = (...args) => {
    return instrumentTracerForCacheComponents(
      originalGetTracer.apply(provider, args)
    )
  }

  // Tracers acquired before registration can use getDelegateTracer() from the
  // proxy provider to get a tracer from the registered provider, bypassing the
  // getTracer() patch above. This can be problematic when third-party
  // instrumentation creates spans that call dynamic APIs like Math.random(),
  // causing a prerendering error. Therefore, patch getDelegateTracer() to apply
  // the same tracer instrumentation as getTracer().
  if (isProxyTracerProvider(provider)) {
    const originalGetDelegateTracer = provider.getDelegateTracer.bind(provider)
    provider.getDelegateTracer = (...args) => {
      const tracer = originalGetDelegateTracer(...args)
      return tracer === undefined
        ? undefined
        : instrumentTracerForCacheComponents(tracer)
    }
  }
}

function instrumentTracerForCacheComponents(tracer: Tracer): Tracer {
  if (WeakTracers.has(tracer)) {
    return tracer
  }
  const originalStartSpan = tracer.startSpan
  tracer.startSpan = (...startSpanArgs) => {
    return instrumentSpanForCacheComponents(
      workUnitAsyncStorage.exit(() =>
        originalStartSpan.apply(tracer, startSpanArgs)
      )
    )
  }

  const originalStartActiveSpan = tracer.startActiveSpan
  // @ts-ignore TS doesn't recognize the overloads correctly
  tracer.startActiveSpan = (...startActiveSpanArgs: any[]) => {
    const workUnitStore = workUnitAsyncStorage.getStore()
    let fnIdx: number = 0
    if (
      startActiveSpanArgs.length === 2 &&
      typeof startActiveSpanArgs[1] === 'function'
    ) {
      fnIdx = 1
    } else if (
      startActiveSpanArgs.length === 3 &&
      typeof startActiveSpanArgs[2] === 'function'
    ) {
      fnIdx = 2
    } else if (
      startActiveSpanArgs.length > 3 &&
      typeof startActiveSpanArgs[3] === 'function'
    ) {
      fnIdx = 3
    }

    if (fnIdx) {
      const originalFn = startActiveSpanArgs[fnIdx]
      if (workUnitStore && isUseCacheFunction(originalFn)) {
        console.error(
          'A Cache Function (`use cache`) was passed to startActiveSpan which means it will receive a Span argument with a possibly random ID on every invocation leading to cache misses. Provide a wrapping function around the Cache Function that does not forward the Span argument to avoid this issue.'
        )
      }
      startActiveSpanArgs[fnIdx] = (span: Span) => {
        // Instrument spans even when they are created outside a work unit:
        // they may be ended later from within a prerender.
        instrumentSpanForCacheComponents(span)
        return workUnitStore
          ? workUnitAsyncStorage.run(workUnitStore, originalFn, span)
          : originalFn(span)
      }
    }

    return workUnitAsyncStorage.exit(() => {
      // @ts-ignore TS doesn't recognize the overloads correctly
      return originalStartActiveSpan.apply(tracer, startActiveSpanArgs)
    })
  }

  WeakTracers.add(tracer)
  return tracer
}

const WeakTracers = new WeakSet<Tracer>()

function instrumentSpanForCacheComponents(span: Span): Span {
  if (WeakSpans.has(span)) {
    return span
  }
  const originalEnd = span.end.bind(span)
  // Ending a span invokes SDK processors, which may read time or randomness
  // for metrics. Like span creation, this is telemetry rather than rendering.
  span.end = (...args) => workUnitAsyncStorage.exit(originalEnd, ...args)
  WeakSpans.add(span)
  return span
}

const WeakSpans = new WeakSet<Span>()
