/** @jest-environment node */

import './node-environment'

import { actionAsyncStorage } from './app-render/action-async-storage.external'
import { afterTaskAsyncStorage } from './app-render/after-task-async-storage.external'
import { consoleAsyncStorage } from './app-render/console-async-storage.external'
import { dynamicAccessAsyncStorage } from './app-render/dynamic-access-async-storage.external'
import { workAsyncStorage } from './app-render/work-async-storage.external'
import { workUnitAsyncStorage } from './app-render/work-unit-async-storage.external'
import {
  createLocalSpan,
  registerLocalSpanRecorder,
  withLocalSpan,
} from './lib/trace/local-span-recorder'
import { getTracer, SpanStatusCode, type Span } from './lib/trace/tracer'
import { runInWebSocketHookContext } from './websocket-hook-context'
import { finalizeAppRouteWebSocketUpgradeSpan } from './route-modules/app-route/websocket-runtime.external'

describe('runInWebSocketHookContext', () => {
  const localSpanRecorderKey = Symbol.for('@next/local-span-recorder')
  const previousDevServer = process.env.__NEXT_DEV_SERVER
  const previousRecorder = (globalThis as any)[localSpanRecorderKey]

  beforeAll(() => {
    process.env.__NEXT_DEV_SERVER = '1'
    registerLocalSpanRecorder()
  })

  afterAll(() => {
    if (previousDevServer === undefined) {
      delete process.env.__NEXT_DEV_SERVER
    } else {
      process.env.__NEXT_DEV_SERVER = previousDevServer
    }
    if (previousRecorder === undefined) {
      delete (globalThis as any)[localSpanRecorderKey]
    } else {
      ;(globalThis as any)[localSpanRecorderKey] = previousRecorder
    }
  })

  it('exits every App Route store and the local trace, then restores them', () => {
    const stores = {
      work: { route: '/ws' },
      workUnit: { type: 'request' },
      action: { isAppRoute: true },
      after: { rootTaskSpawnPhase: 'render' },
      dynamic: { type: 'request' },
      console: { depth: 1 },
    }
    const span = createLocalSpan({
      name: 'websocket.handshake',
      isolateOpenTelemetry: true,
    })

    workAsyncStorage.run(stores.work as any, () =>
      workUnitAsyncStorage.run(stores.workUnit as any, () =>
        actionAsyncStorage.run(stores.action as any, () =>
          afterTaskAsyncStorage.run(stores.after as any, () =>
            dynamicAccessAsyncStorage.run(stores.dynamic as any, () =>
              consoleAsyncStorage.run(stores.console as any, () =>
                withLocalSpan(span, () => {
                  expect(workAsyncStorage.getStore()).toBe(stores.work)
                  expect(workUnitAsyncStorage.getStore()).toBe(stores.workUnit)
                  expect(actionAsyncStorage.getStore()).toBe(stores.action)
                  expect(afterTaskAsyncStorage.getStore()).toBe(stores.after)
                  expect(dynamicAccessAsyncStorage.getStore()).toBe(
                    stores.dynamic
                  )
                  expect(consoleAsyncStorage.getStore()).toBe(stores.console)
                  expect(getTracer().getActiveScopeSpan()).toBe(span)

                  expect(
                    runInWebSocketHookContext(() => {
                      expect(workAsyncStorage.getStore()).toBeUndefined()
                      expect(workUnitAsyncStorage.getStore()).toBeUndefined()
                      expect(actionAsyncStorage.getStore()).toBeUndefined()
                      expect(afterTaskAsyncStorage.getStore()).toBeUndefined()
                      expect(
                        dynamicAccessAsyncStorage.getStore()
                      ).toBeUndefined()
                      expect(consoleAsyncStorage.getStore()).toBeUndefined()
                      expect(getTracer().getActiveScopeSpan()).toBeUndefined()
                      return 'detached'
                    })
                  ).toBe('detached')

                  expect(workAsyncStorage.getStore()).toBe(stores.work)
                  expect(workUnitAsyncStorage.getStore()).toBe(stores.workUnit)
                  expect(actionAsyncStorage.getStore()).toBe(stores.action)
                  expect(afterTaskAsyncStorage.getStore()).toBe(stores.after)
                  expect(dynamicAccessAsyncStorage.getStore()).toBe(
                    stores.dynamic
                  )
                  expect(consoleAsyncStorage.getStore()).toBe(stores.console)
                  expect(getTracer().getActiveScopeSpan()).toBe(span)
                })
              )
            )
          )
        )
      )
    )
  })
})

describe('App Route WebSocket handshake spans', () => {
  function createSpan() {
    return {
      recordException: jest.fn(),
      setAttribute: jest.fn(),
      setAttributes: jest.fn(),
      setStatus: jest.fn(),
      updateName: jest.fn(),
    } as unknown as jest.Mocked<Span>
  }

  it('records a caught server error with HTTP trace parity', () => {
    const span = createSpan()
    const error = new TypeError('hook failed')

    finalizeAppRouteWebSocketUpgradeSpan(
      span,
      'GET',
      '/ws',
      { statusCode: 101, upgraded: true },
      error
    )

    expect(span.recordException).toHaveBeenCalledWith(error)
    expect(span.setAttribute).toHaveBeenCalledWith('error.type', 'TypeError')
    expect(span.setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.ERROR,
      message: 'hook failed',
    })
  })

  it('does not mark a successful disconnected handshake as failed', () => {
    const span = createSpan()

    finalizeAppRouteWebSocketUpgradeSpan(
      span,
      'GET',
      '/ws',
      { statusCode: 101, upgraded: true },
      undefined
    )

    expect(span.recordException).not.toHaveBeenCalled()
    expect(span.setStatus).not.toHaveBeenCalled()
  })
})
