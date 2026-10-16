const mockCreateFromFetch = jest.fn()
const mockFetch = jest.fn()
const mockWaitForWebpackRuntimeHotUpdate = jest.fn()

jest.mock('react-server-dom-webpack/client', () => ({
  createFromFetch: (...args: unknown[]) => mockCreateFromFetch(...args),
  createFromReadableStream: jest.fn(),
}))

jest.mock('../segment-cache/fetch', () => ({
  fetch: (...args: unknown[]) => mockFetch(...args),
}))

jest.mock('../../dev/hot-reloader/app/hot-reloader-app', () => ({
  waitForWebpackRuntimeHotUpdate: () => mockWaitForWebpackRuntimeHotUpdate(),
}))

import { createFetch } from './fetch-server-response'

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

// Resolves on the next macrotask, after all pending microtasks have run.
function waitForPendingMicrotasks() {
  return new Promise((resolve) => setImmediate(resolve))
}

describe('createFetch', () => {
  const originalEnv = process.env
  const hadSelf = 'self' in globalThis

  beforeAll(() => {
    // `createFetch` reads `self.__next_r` in dev.
    if (!hadSelf) {
      ;(globalThis as any).self = globalThis
    }
  })

  afterAll(() => {
    if (!hadSelf) {
      delete (globalThis as any).self
    }
  })

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.__NEXT_SERVER_COMPONENTS_HMR_CANCELLATION
    mockCreateFromFetch.mockReset()
    mockFetch.mockReset()
    mockWaitForWebpackRuntimeHotUpdate.mockReset()
    mockCreateFromFetch.mockImplementation(
      (promiseForResponse: Promise<Response>) =>
        promiseForResponse.then(() => ({}))
    )
  })

  afterEach(() => {
    process.env = originalEnv
  })

  /**
   * Starts a navigation fetch and returns the promise that was handed to the
   * Flight client, once the Flight client has been created. The network
   * response is still pending at that point.
   */
  async function startFetch() {
    const network = createDeferred<Response>()
    const fetchStarted = createDeferred<void>()
    mockFetch.mockImplementation(() => {
      fetchStarted.resolve()
      return network.promise
    })

    const rscResponsePromise = createFetch(
      new URL('http://localhost/target'),
      {},
      null,
      true
    )
    await fetchStarted.promise

    // The Flight client is created as soon as the request starts (before the
    // response arrives), so React's debug timing includes the network latency.
    expect(mockCreateFromFetch).toHaveBeenCalledTimes(1)
    const promiseForResponse: Promise<Response> =
      mockCreateFromFetch.mock.calls[0][0]

    let resolvedResponse: Response | null = null
    promiseForResponse.then((res) => {
      resolvedResponse = res
    })

    const response = new Response('', { status: 200 })
    network.resolve(response)
    await rscResponsePromise

    return { response, getResolvedResponse: () => resolvedResponse }
  }

  it('defers Flight decoding until the pending webpack hot update is applied', async () => {
    process.env.__NEXT_DEV_SERVER = '1'
    delete process.env.TURBOPACK
    const hotUpdate = createDeferred<void>()
    mockWaitForWebpackRuntimeHotUpdate.mockReturnValue(hotUpdate.promise)

    const { response, getResolvedResponse } = await startFetch()

    // The response has arrived, but the Flight client must not process it
    // (and replay server logs into the dev overlay) while the webpack hot
    // update is still pending.
    await waitForPendingMicrotasks()
    expect(mockWaitForWebpackRuntimeHotUpdate).toHaveBeenCalledTimes(1)
    expect(getResolvedResponse()).toBe(null)

    hotUpdate.resolve()
    await waitForPendingMicrotasks()
    expect(getResolvedResponse()).toBe(response)
  })

  it('does not wait for a webpack hot update with Turbopack', async () => {
    process.env.__NEXT_DEV_SERVER = '1'
    process.env.TURBOPACK = '1'
    mockWaitForWebpackRuntimeHotUpdate.mockReturnValue(new Promise(() => {}))

    const { response, getResolvedResponse } = await startFetch()

    await waitForPendingMicrotasks()
    expect(getResolvedResponse()).toBe(response)
    expect(mockWaitForWebpackRuntimeHotUpdate).not.toHaveBeenCalled()
  })

  it('does not wait for a webpack hot update outside of the dev server', async () => {
    delete process.env.__NEXT_DEV_SERVER
    delete process.env.TURBOPACK
    mockWaitForWebpackRuntimeHotUpdate.mockReturnValue(new Promise(() => {}))

    const { response, getResolvedResponse } = await startFetch()

    await waitForPendingMicrotasks()
    expect(getResolvedResponse()).toBe(response)
    expect(mockWaitForWebpackRuntimeHotUpdate).not.toHaveBeenCalled()
  })
})
