import { RequestInsights } from './request-insights'
import {
  getRequestInsightsCausalTarget,
  takeRequestInsightsCausalToken,
} from './request-insights-causal'
import { prepareRequestInsightsSandboxFetch } from './request-insights-sandbox-fetch'

describe('prepareRequestInsightsSandboxFetch', () => {
  it('keeps fetches isolated by controller and identity', () => {
    const first = new RequestInsights()
    const second = new RequestInsights()
    const firstIdentity = {
      requestId: 'first-edge-request',
      htmlRequestId: 'first-edge-request',
      url: '/first',
    }
    const secondIdentity = {
      requestId: 'second-edge-request',
      htmlRequestId: 'second-edge-request',
      url: '/second',
    }

    prepareRequestInsightsSandboxFetch({
      context: { identity: firstIdentity, requestInsights: first },
      init: {},
      url: 'https://example.com/first',
    }).complete({ status: 201 })
    prepareRequestInsightsSandboxFetch({
      context: { identity: secondIdentity, requestInsights: second },
      init: {},
      url: 'https://example.com/second',
    }).complete({ status: 202 })

    expect(first.getSnapshot().requests).toEqual([
      expect.objectContaining({
        requestId: 'first-edge-request',
        fetches: [expect.objectContaining({ statusCode: 201 })],
      }),
    ])
    expect(second.getSnapshot().requests).toEqual([
      expect.objectContaining({
        requestId: 'second-edge-request',
        fetches: [expect.objectContaining({ statusCode: 202 })],
      }),
    ])

    first.dispose()
    second.dispose()
  })

  it('links and revokes a same-origin causal capability', () => {
    const requestInsights = new RequestInsights()
    const identity = {
      requestId: 'edge-parent',
      rootRequestId: 'edge-parent-root',
      htmlRequestId: 'edge-parent',
      origin: 'http://app.localhost',
      url: '/edge',
    }
    const target = getRequestInsightsCausalTarget(
      new URL('http://app.localhost/api/child'),
      'POST'
    )!
    const prepared = prepareRequestInsightsSandboxFetch({
      context: {
        identity,
        origin: 'http://app.localhost',
        requestInsights,
      },
      init: {
        method: 'POST',
        headers: {
          cookie: '__next_request_insights_causal=caller; user=value',
        },
      },
      url: target.origin + target.pathname,
    })
    const headers = Object.fromEntries(new Headers(prepared.init.headers))
    const token = takeRequestInsightsCausalToken(headers)

    expect(headers.cookie).toBe('user=value')
    expect(token).toBeDefined()
    expect(requestInsights.consumeCausalToken(token!, target)).toEqual({
      parentRootRequestId: 'edge-parent-root',
      parentFetchIndex: 1,
    })

    expect(() => prepared.complete()).not.toThrow()
    expect(requestInsights.consumeCausalToken(token!, target)).toBeUndefined()
    requestInsights.dispose()
  })

  it('links a direct server fetch when the ingress origin is proxied', () => {
    const requestInsights = new RequestInsights()
    const identity = {
      requestId: 'proxied-edge-parent',
      rootRequestId: 'proxied-edge-parent-root',
      htmlRequestId: 'proxied-edge-parent',
      origin: 'https://app.localhost',
      executionOrigin: 'http://localhost:3012',
      url: '/edge',
    }
    const target = getRequestInsightsCausalTarget(
      new URL('http://localhost:3012/api/child'),
      'GET'
    )!
    const prepared = prepareRequestInsightsSandboxFetch({
      context: {
        identity,
        origin: 'https://app.localhost',
        requestInsights,
      },
      init: {},
      url: target.origin + target.pathname,
    })
    const headers = Object.fromEntries(new Headers(prepared.init.headers))
    const token = takeRequestInsightsCausalToken(headers)

    expect(token).toBeDefined()
    expect(requestInsights.consumeCausalToken(token!, target)).toEqual({
      parentRootRequestId: 'proxied-edge-parent-root',
      parentFetchIndex: 1,
    })

    prepared.complete({ status: 200 })
    requestInsights.dispose()
  })

  it('uses unique indexes and completes each fetch once', () => {
    const requestInsights = new RequestInsights()
    const identity = {
      requestId: 'edge-request',
      htmlRequestId: 'edge-request',
      url: '/edge',
    }
    const first = prepareRequestInsightsSandboxFetch({
      context: { identity, requestInsights },
      init: {},
      url: 'https://example.com/first',
    })
    const second = prepareRequestInsightsSandboxFetch({
      context: { identity, requestInsights },
      init: {},
      url: 'https://example.com/second',
    })

    first.complete({ status: 200 })
    first.complete({ status: 500 })
    second.complete({ status: 201 })

    expect(requestInsights.getSnapshot().requests[0].fetches).toEqual([
      expect.objectContaining({ index: 1, statusCode: 200 }),
      expect.objectContaining({ index: 2, statusCode: 201 }),
    ])
    requestInsights.dispose()
  })

  it('normalizes boxed method and credentials values', () => {
    const requestInsights = new RequestInsights()
    const mintCausalToken = jest.spyOn(requestInsights, 'mintCausalToken')
    const prepared = prepareRequestInsightsSandboxFetch({
      context: {
        identity: {
          requestId: 'edge-request',
          rootRequestId: 'edge-request-root',
          htmlRequestId: 'edge-request',
          origin: 'http://app.localhost',
          url: '/edge',
        },
        requestInsights,
      },
      init: {
        method: Object('POST') as string,
        credentials: Object('omit') as RequestCredentials,
        headers: {
          cookie: '__next_request_insights_causal=caller; user=value',
        },
      },
      url: 'http://app.localhost/api/child',
    })

    expect(prepared.init.method).toBe('POST')
    expect(prepared.init.credentials).toBe('omit')
    expect(new Headers(prepared.init.headers).get('cookie')).toBe('user=value')
    expect(mintCausalToken).not.toHaveBeenCalled()
    prepared.complete({ status: 204 })
    expect(requestInsights.getSnapshot().requests[0].fetches).toEqual([
      expect.objectContaining({ method: 'POST', statusCode: 204 }),
    ])
    requestInsights.dispose()
  })

  it('reads and coerces RequestInit strings once', () => {
    const requestInsights = new RequestInsights()
    let methodReads = 0
    let methodCoercions = 0
    const init = Object.defineProperty({}, 'method', {
      get() {
        methodReads++
        return {
          toString() {
            methodCoercions++
            return 'POST'
          },
        }
      },
    }) as RequestInit
    const prepared = prepareRequestInsightsSandboxFetch({
      context: {
        identity: {
          requestId: 'edge-request',
          htmlRequestId: 'edge-request',
          url: '/edge',
        },
        requestInsights,
      },
      init,
      url: 'https://example.com',
    })

    expect(prepared.init.method).toBe('POST')
    expect(prepared.init.method).toBe('POST')
    expect(methodReads).toBe(1)
    expect(methodCoercions).toBe(1)
    prepared.complete({ status: 200 })
    requestInsights.dispose()
  })

  it('replays RequestInit getter errors without recording a fetch', () => {
    const requestInsights = new RequestInsights()
    const error = new Error('method failed')
    const init = Object.defineProperty({}, 'method', {
      get() {
        throw error
      },
    }) as RequestInit
    const prepared = prepareRequestInsightsSandboxFetch({
      context: {
        identity: {
          requestId: 'edge-request',
          htmlRequestId: 'edge-request',
          url: '/edge',
        },
        requestInsights,
      },
      init,
      url: 'https://example.com',
    })

    expect(() => prepared.init.method).toThrow(error)
    expect(requestInsights.getSnapshot().requests).toEqual([])
    requestInsights.dispose()
  })

  it('sanitizes reserved cookies before replaying coercion errors', () => {
    const requestInsights = new RequestInsights()
    const error = new Error('method coercion failed')
    let methodReads = 0
    let methodCoercions = 0
    const init = Object.defineProperties(
      {},
      {
        headers: {
          value: {
            cookie: '__next_request_insights_causal=caller; user=value',
          },
        },
        method: {
          get() {
            methodReads++
            return {
              toString() {
                methodCoercions++
                throw error
              },
            }
          },
        },
      }
    ) as RequestInit
    const prepared = prepareRequestInsightsSandboxFetch({
      context: {
        identity: {
          requestId: 'edge-request',
          htmlRequestId: 'edge-request',
          url: '/edge',
        },
        requestInsights,
      },
      init,
      url: 'https://example.com',
    })

    expect(new Headers(prepared.init.headers).get('cookie')).toBe('user=value')
    expect(() => prepared.init.method).toThrow(error)
    expect(methodReads).toBe(1)
    expect(methodCoercions).toBe(1)
    expect(requestInsights.getSnapshot().requests).toEqual([])
    requestInsights.dispose()
  })

  it('replays HeadersInit conversion errors without network access', async () => {
    const requestInsights = new RequestInsights()
    const error = new Error('headers conversion failed')
    let iteratorCreations = 0
    let networkRequests = 0
    const headers = {
      [Symbol.iterator]() {
        iteratorCreations++
        if (iteratorCreations > 1) {
          return [['cookie', '__next_request_insights_causal=caller']][
            Symbol.iterator
          ]()
        }

        let yieldedCookie = false
        return {
          next() {
            if (!yieldedCookie) {
              yieldedCookie = true
              return {
                done: false,
                value: ['cookie', '__next_request_insights_causal=caller'],
              }
            }
            throw error
          },
        }
      },
    } as unknown as HeadersInit
    const prepared = prepareRequestInsightsSandboxFetch({
      context: {
        identity: {
          requestId: 'edge-request',
          htmlRequestId: 'edge-request',
          url: '/edge',
        },
        requestInsights,
      },
      init: { headers },
      url: 'https://example.com',
    })
    const underlyingFetch = async (_url: string, init: RequestInit) => {
      new Headers(init.headers)
      networkRequests++
      return new Response('unexpected request')
    }

    await expect(
      underlyingFetch('https://example.com', prepared.init)
    ).rejects.toThrow(error)
    expect(iteratorCreations).toBe(1)
    expect(networkRequests).toBe(0)
    expect(requestInsights.getSnapshot().requests).toEqual([])
    requestInsights.dispose()
  })

  it('strips reserved cookies when causal token minting fails', () => {
    const requestInsights = new RequestInsights()
    jest.spyOn(requestInsights, 'mintCausalToken').mockImplementation(() => {
      throw new Error('mint failed')
    })
    const prepared = prepareRequestInsightsSandboxFetch({
      context: {
        identity: {
          requestId: 'edge-request',
          rootRequestId: 'edge-request-root',
          htmlRequestId: 'edge-request',
          origin: 'http://app.localhost',
          url: '/edge',
        },
        requestInsights,
      },
      init: {
        headers: {
          cookie: '__next_request_insights_causal=caller; user=value',
        },
      },
      url: 'http://app.localhost/api/child',
    })

    expect(new Headers(prepared.init.headers).get('cookie')).toBe('user=value')
    expect(() => prepared.complete()).not.toThrow()
    expect(requestInsights.getSnapshot().requests).toEqual([])
    requestInsights.dispose()
  })
})
