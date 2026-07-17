/**
 * @jest-environment node
 */

import {
  beginRequestInsightOperation,
  clearRequestInsightsForTest,
  endRequestInsightOperation,
  finishRequestInsightSession,
  getRequestInsightsSnapshot,
  recordRequestInsightFetch,
  runWithDetachedRequestInsightContext,
  runWithRequestInsightOperation,
  runWithRequestInsightsSession,
  subscribeRequestInsights,
} from './request-insights'
import {
  registerRequestInsightsRuntime,
  unregisterRequestInsightsRuntimeForTest,
} from './request-insights-runtime'
import { AppRenderSpan, BaseServerSpan, NodeSpan } from './constants'

describe('request insights runtime', () => {
  beforeEach(() => {
    registerRequestInsightsRuntime().setEnabled(true)
  })

  afterEach(() => {
    clearRequestInsightsForTest()
    unregisterRequestInsightsRuntimeForTest()
  })

  it('records typed nested operations for a completed request', () => {
    runWithRequestInsightsSession(
      {
        requestId: 'request-1',
        htmlRequestId: 'html-1',
        url: '/products/1?preview=1',
        method: 'GET',
        startTime: 100,
      },
      () => {
        runOperation(
          {
            type: BaseServerSpan.render,
            name: 'render /products/[id]',
            category: 'nextjs',
          },
          () => {
            runOperation(
              {
                type: AppRenderSpan.getBodyResult,
                name: 'render route (app) /products/[id]',
                category: 'nextjs',
              },
              () => undefined
            )
          }
        )

        finishRequestInsightSession({
          route: '/products/[id]',
          statusCode: 200,
          isRsc: false,
          status: 'ok',
          endTime: 150,
        })
      }
    )

    const request = getRequestInsightsSnapshot().requests[0]
    expect(request).toEqual(
      expect.objectContaining({
        requestId: 'request-1',
        htmlRequestId: 'html-1',
        route: '/products/[id]',
        url: '/products/1?preview=1',
        method: 'GET',
        statusCode: 200,
        isRsc: false,
        startTime: 100,
        durationMs: 50,
        status: 'ok',
        fetches: [],
      })
    )
    expect(request.operations).toHaveLength(2)

    const outer = request.operations.find(
      (operation) => operation.type === BaseServerSpan.render
    )
    const inner = request.operations.find(
      (operation) => operation.type === AppRenderSpan.getBodyResult
    )

    expect(outer).toEqual(
      expect.objectContaining({
        id: expect.any(Number),
        parentId: undefined,
        name: 'render /products/[id]',
        category: 'nextjs',
        status: 'ok',
        startTime: expect.any(Number),
        durationMs: expect.any(Number),
      })
    )
    expect(inner).toEqual(
      expect.objectContaining({
        id: expect.any(Number),
        parentId: outer?.id,
        name: 'render route (app) /products/[id]',
        category: 'nextjs',
        status: 'ok',
      })
    )
  })

  it('keeps overlapping request sessions isolated', async () => {
    let releaseFirstOperation: () => void = () => undefined
    const firstOperationBlocked = new Promise<void>((resolve) => {
      releaseFirstOperation = resolve
    })
    let signalFirstOperationStarted: () => void = () => undefined
    const firstOperationStarted = new Promise<void>((resolve) => {
      signalFirstOperationStarted = resolve
    })

    const firstRequest = runWithRequestInsightsSession(
      {
        requestId: 'request-a',
        htmlRequestId: 'html-a',
        url: '/a',
        method: 'GET',
      },
      async () => {
        await runOperation(
          {
            type: NodeSpan.runHandler,
            name: 'request-a operation',
            category: 'nextjs',
          },
          async () => {
            signalFirstOperationStarted()
            await firstOperationBlocked
          }
        )
        finishRequestInsightSession({ route: '/a', statusCode: 200 })
      }
    )

    await firstOperationStarted

    await runWithRequestInsightsSession(
      {
        requestId: 'request-b',
        htmlRequestId: 'html-b',
        url: '/b',
        method: 'POST',
      },
      async () => {
        await runOperation(
          {
            type: NodeSpan.runHandler,
            name: 'request-b operation',
            category: 'nextjs',
          },
          async () => Promise.resolve()
        )
        finishRequestInsightSession({ route: '/b', statusCode: 201 })
      }
    )

    releaseFirstOperation()
    await firstRequest

    const requests = getRequestInsightsSnapshot().requests
    expect(requests).toHaveLength(2)
    expect(
      requests.map((request) => ({
        requestId: request.requestId,
        operationNames: request.operations.map((operation) => operation.name),
      }))
    ).toEqual([
      {
        requestId: 'request-b',
        operationNames: ['request-b operation'],
      },
      {
        requestId: 'request-a',
        operationNames: ['request-a operation'],
      },
    ])
  })

  it('parents parallel child operations to the same active operation', async () => {
    await runWithRequestInsightsSession(
      {
        requestId: 'request-parallel',
        htmlRequestId: 'html-parallel',
        url: '/parallel',
      },
      async () => {
        await runOperation(
          {
            type: BaseServerSpan.render,
            name: 'parallel parent',
            category: 'nextjs',
          },
          async () => {
            await Promise.all([
              runOperation(
                {
                  type: NodeSpan.runHandler,
                  name: 'parallel child a',
                  category: 'application',
                },
                async () => Promise.resolve()
              ),
              runOperation(
                {
                  type: NodeSpan.runHandler,
                  name: 'parallel child b',
                  category: 'application',
                },
                async () => Promise.resolve()
              ),
            ])
          }
        )
        finishRequestInsightSession({ statusCode: 200 })
      }
    )

    const operations = getRequestInsightsSnapshot().requests[0].operations
    const parent = operations.find(
      (operation) => operation.name === 'parallel parent'
    )
    const children = operations.filter((operation) =>
      operation.name.startsWith('parallel child')
    )

    expect(children).toHaveLength(2)
    expect(new Set(children.map((operation) => operation.id)).size).toBe(2)
    expect(children.map((operation) => operation.parentId)).toEqual([
      parent?.id,
      parent?.id,
    ])
  })

  it('supports manual operations and ends each operation exactly once', () => {
    runWithRequestInsightsSession(
      {
        requestId: 'request-manual',
        htmlRequestId: 'html-manual',
        url: '/manual',
        startTime: 100,
      },
      () => {
        const operation = beginRequestInsightOperation({
          type: NodeSpan.runHandler,
          name: 'manual operation',
          category: 'application',
          startTime: 110,
        })

        endRequestInsightOperation(operation, {
          status: 'error',
          error: new TypeError('failed'),
          endTime: 125,
        })
        endRequestInsightOperation(operation, { endTime: 140 })
        finishRequestInsightSession({ statusCode: 500, endTime: 150 })
      }
    )

    expect(getRequestInsightsSnapshot().requests[0].operations).toEqual([
      expect.objectContaining({
        type: NodeSpan.runHandler,
        name: 'manual operation',
        category: 'application',
        startTime: 110,
        durationMs: 15,
        status: 'error',
        error: { type: 'TypeError', message: 'failed' },
      }),
    ])
  })

  it('records errors from synchronous and asynchronous operations', async () => {
    await runWithRequestInsightsSession(
      {
        requestId: 'request-errors',
        htmlRequestId: 'html-errors',
        url: '/errors',
      },
      async () => {
        expect(() =>
          runOperation(
            {
              type: BaseServerSpan.render,
              name: 'sync failure',
              category: 'nextjs',
            },
            () => {
              throw new TypeError('sync boom')
            }
          )
        ).toThrow('sync boom')

        await expect(
          runOperation(
            {
              type: AppRenderSpan.getBodyResult,
              name: 'async failure',
              category: 'nextjs',
            },
            async () => {
              throw new RangeError('async boom')
            }
          )
        ).rejects.toThrow('async boom')

        finishRequestInsightSession({ statusCode: 500 })
      }
    )

    expect(getRequestInsightsSnapshot().requests[0]).toEqual(
      expect.objectContaining({
        status: 'error',
        operations: [
          expect.objectContaining({
            name: 'sync failure',
            status: 'error',
            error: { type: 'TypeError', message: 'sync boom' },
          }),
          expect.objectContaining({
            name: 'async failure',
            status: 'error',
            error: { type: 'RangeError', message: 'async boom' },
          }),
        ],
      })
    )
  })

  it('clears operation parentage in a detached context', () => {
    runWithRequestInsightsSession(
      {
        requestId: 'request-detached',
        htmlRequestId: 'html-detached',
        url: '/detached',
      },
      () => {
        runOperation(
          {
            type: BaseServerSpan.render,
            name: 'outer operation',
            category: 'nextjs',
          },
          () => {
            runOperation(
              {
                type: AppRenderSpan.getBodyResult,
                name: 'nested operation',
                category: 'nextjs',
              },
              () => undefined
            )
            runWithDetachedRequestInsightContext(() =>
              runOperation(
                {
                  type: NodeSpan.runHandler,
                  name: 'detached operation',
                  category: 'nextjs',
                },
                () => undefined
              )
            )
          }
        )
        finishRequestInsightSession({ statusCode: 200 })
      }
    )

    const operations = getRequestInsightsSnapshot().requests[0].operations
    const outer = operations.find(
      (operation) => operation.name === 'outer operation'
    )
    const nested = operations.find(
      (operation) => operation.name === 'nested operation'
    )
    const detached = operations.find(
      (operation) => operation.name === 'detached operation'
    )

    expect(outer?.parentId).toBeUndefined()
    expect(nested?.parentId).toBe(outer?.id)
    expect(detached?.parentId).toBeUndefined()
  })

  it('publishes completed requests once and ignores late operations', () => {
    const listener = jest.fn()
    const unsubscribe = subscribeRequestInsights(listener)
    let unfinishedOperation:
      | ReturnType<typeof beginRequestInsightOperation>
      | undefined

    runWithRequestInsightsSession(
      {
        requestId: 'request-completion',
        htmlRequestId: 'html-completion',
        url: '/completion',
      },
      () => {
        unfinishedOperation = beginRequestInsightOperation({
          type: NodeSpan.runHandler,
          name: 'background operation',
          category: 'nextjs',
        })

        expect(getRequestInsightsSnapshot()).toEqual({ requests: [] })
        expect(listener).not.toHaveBeenCalled()

        finishRequestInsightSession({ statusCode: 200 })
        finishRequestInsightSession({ statusCode: 500 })

        endRequestInsightOperation(unfinishedOperation)
      }
    )

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'request-completion' })
    )
    expect(getRequestInsightsSnapshot().requests).toEqual([
      expect.objectContaining({
        requestId: 'request-completion',
        statusCode: 200,
        status: 'ok',
        operations: [],
      }),
    ])

    unsubscribe()
  })

  it('preserves subscriptions made before explicit runtime registration', () => {
    unregisterRequestInsightsRuntimeForTest()

    const originalDevServer = process.env.__NEXT_DEV_SERVER
    process.env.__NEXT_DEV_SERVER = '1'
    const listener = jest.fn()
    const unsubscribe = subscribeRequestInsights(listener)

    try {
      registerRequestInsightsRuntime().setEnabled(true)
      runWithRequestInsightsSession(
        {
          requestId: 'request-early-subscription',
          htmlRequestId: 'html-early-subscription',
          url: '/early-subscription',
        },
        () => finishRequestInsightSession({ statusCode: 200 })
      )

      expect(listener).toHaveBeenCalledTimes(1)
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ requestId: 'request-early-subscription' })
      )
    } finally {
      unsubscribe()
      if (originalDevServer === undefined) {
        delete process.env.__NEXT_DEV_SERVER
      } else {
        process.env.__NEXT_DEV_SERVER = originalDevServer
      }
    }
  })

  it('records fetches from their single source and redacts typed URLs', () => {
    runWithRequestInsightsSession(
      {
        requestId: 'request-fetch',
        htmlRequestId: 'html-fetch',
        url: '/account?token=request-secret&keep=1',
      },
      () => {
        runOperation(
          {
            type: AppRenderSpan.getBodyResult,
            name: 'render account',
            category: 'nextjs',
          },
          () => {
            const fetch = {
              url: 'https://user:pass@example.com/data?access_token=abc&keep=1',
              method: 'GET',
              statusCode: 200,
              startTime: 120,
              durationMs: 5,
              cacheStatus: 'miss',
              index: 1,
            }

            recordRequestInsightFetch(fetch)
            recordRequestInsightFetch(fetch)
          }
        )
        finishRequestInsightSession({ statusCode: 200 })
      }
    )

    const request = getRequestInsightsSnapshot().requests[0]
    const parentOperation = request.operations[0]
    expect(request.url).toBe('/account?token=redacted&keep=1')
    expect(request.fetches).toHaveLength(2)
    expect(request.fetches).toEqual([
      expect.objectContaining({
        url: 'https://example.com/data?access_token=redacted&keep=1',
        parentOperationId: parentOperation.id,
      }),
      expect.objectContaining({
        url: 'https://example.com/data?access_token=redacted&keep=1',
        parentOperationId: parentOperation.id,
      }),
    ])
  })

  it('retains the 100 newest completed requests', () => {
    for (let index = 0; index <= 100; index++) {
      runWithRequestInsightsSession(
        {
          requestId: `request-${index}`,
          htmlRequestId: `html-${index}`,
          url: `/request-${index}`,
        },
        () => finishRequestInsightSession({ statusCode: 200 })
      )
    }

    const requests = getRequestInsightsSnapshot().requests
    expect(requests).toHaveLength(100)
    expect(requests[0].requestId).toBe('request-1')
    expect(requests.at(-1)?.requestId).toBe('request-100')
  })
})

function runOperation<T>(
  options: Parameters<typeof beginRequestInsightOperation>[0],
  fn: () => T
): T {
  const operation = beginRequestInsightOperation(options)

  try {
    const result = runWithRequestInsightOperation(operation, fn)
    if (isThenable(result)) {
      return result.then(
        (value) => {
          endRequestInsightOperation(operation)
          return value
        },
        (error) => {
          endRequestInsightOperation(operation, {
            status: 'error',
            error,
          })
          throw error
        }
      ) as T
    }

    endRequestInsightOperation(operation)
    return result
  } catch (error) {
    endRequestInsightOperation(operation, {
      status: 'error',
      error,
    })
    throw error
  }
}

function isThenable<T>(value: T): value is T & PromiseLike<Awaited<T>> {
  return (typeof value === 'object' && value !== null) ||
    typeof value === 'function'
    ? typeof (value as { then?: unknown }).then === 'function'
    : false
}
