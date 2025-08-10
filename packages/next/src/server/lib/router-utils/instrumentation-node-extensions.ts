/**
 * This extension augments opentelemetry after registration if applicable.
 * This extension must only be loaded in Node environments.
 */

import type { Tracer } from '@opentelemetry/api'
import {
  type WorkUnitStore,
  workUnitAsyncStorage,
} from '../../app-render/work-unit-async-storage.external'
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
  // to exit the workUnitAsyncStorage context when generating spans.
  const originalGetTracer = provider.getTracer.bind(provider)
  provider.getTracer = (...args) => {
    const tracer = originalGetTracer.apply(provider, args)
    if (WeakTracers.has(tracer)) {
      return tracer
    }
    const originalStartSpan = tracer.startSpan
    tracer.startSpan = (...startSpanArgs) => {
      return workUnitAsyncStorage.exit(() =>
        originalStartSpan.apply(tracer, startSpanArgs)
      )
    }

    const originalStartActiveSpan = tracer.startActiveSpan
    // @ts-ignore TS doesn't recognize the overloads correctly
    tracer.startActiveSpan = (...startActiveSpanArgs: any[]) => {
      const workUnitStore = workUnitAsyncStorage.getStore()
      if (!workUnitStore) {
        // @ts-ignore TS doesn't recognize the overloads correctly
        return originalStartActiveSpan.apply(tracer, startActiveSpanArgs)
      }

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
        if (isUseCacheFunction(originalFn)) {
          console.error(
            'A Cache Function (`use cache`) was passed to startActiveSpan which means it will receive a Span argument with a possibly random ID on every invocation leading to cache misses. Provide a wrapping function around the Cache Function that does not forward the Span argument to avoid this issue.'
          )
        }
        startActiveSpanArgs[fnIdx] = withWorkUnitContext(
          workUnitStore,
          originalFn
        )
      }

      return workUnitAsyncStorage.exit(() => {
        // @ts-ignore TS doesn't recognize the overloads correctly
        return originalStartActiveSpan.apply(tracer, startActiveSpanArgs)
      })
    }

    WeakTracers.add(tracer)
    return tracer
  }
}

const WeakTracers = new WeakSet<Tracer>()

function withWorkUnitContext(
  workUnitStore: WorkUnitStore,
  fn: (...args: any[]) => any
) {
  return (...args: any[]) =>
    workUnitAsyncStorage.run(workUnitStore, fn, ...args)
}
