/**
 * Regression test for https://github.com/vercel/next.js/issues/91831
 *
 * Next.js ships a CJS and an ESM copy of
 * `packages/next/src/server/lib/trace/tracer.ts`. `rootSpanIdKey` is an OTEL
 * context key created with `api.createContextKey('next.rootSpanId')`, which
 * resolves to `Symbol.for('next.rootSpanId')` — a shared global symbol. That
 * means both module realms observe the same spanId through the OTEL context.
 *
 * If the attribute store and the span id counter were module-local, each realm
 * would look up the shared spanId in its own empty Map and mis-classify
 * downstream spans as new root spans. The fix is to move both onto `globalThis`
 * via `Symbol.for` keys, so requiring the tracer from any module system shares
 * a single store.
 *
 * This test asserts the mechanism: after loading the tracer, the store and
 * counter must live on `globalThis` under the expected `Symbol.for` keys, and
 * reloading the tracer in an isolated module scope must not replace them.
 */

const STORE_KEY = Symbol.for('next.rootSpanAttributesStore')
const COUNTER_KEY = Symbol.for('next.tracerSpanIdCounter')

describe('tracer dual-module singleton store (#91831)', () => {
  it('exposes the attribute store and span id counter on globalThis', () => {
    require('next/dist/server/lib/trace/tracer')

    const store = (globalThis as any)[STORE_KEY]
    const counter = (globalThis as any)[COUNTER_KEY]

    expect(store).toBeInstanceOf(Map)
    expect(counter).toEqual({ value: expect.any(Number) })
  })

  it('reuses the same globalThis store when the tracer is re-required in isolation', () => {
    require('next/dist/server/lib/trace/tracer')
    const storeBefore = (globalThis as any)[STORE_KEY]
    const counterBefore = (globalThis as any)[COUNTER_KEY]

    jest.isolateModules(() => {
      // Simulates a second module realm (e.g. the ESM copy of tracer.ts
      // loaded by a build template like app-page.ts) requiring the tracer
      // again. Without the globalThis singletons, this would create a fresh
      // module-local Map and counter.
      require('next/dist/server/lib/trace/tracer')
    })

    expect((globalThis as any)[STORE_KEY]).toBe(storeBefore)
    expect((globalThis as any)[COUNTER_KEY]).toBe(counterBefore)
  })
})
