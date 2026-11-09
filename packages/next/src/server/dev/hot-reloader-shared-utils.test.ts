import { getVersionInfo } from './hot-reloader-shared-utils'

jest.mock('../../lib/helpers/get-registry', () => ({
  getRegistry: jest.fn(async () => 'https://registry.example/'),
}))

describe('getVersionInfo', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    jest.restoreAllMocks()
  })

  it('reports an unknown staleness when the registry never answers', async () => {
    // A registry that accepts the request and never responds: the fetch only
    // settles when its signal aborts.
    const fetchMock = jest.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(init?.signal?.reason)
          )
        })
    )
    global.fetch = fetchMock

    // Fire the timeout right away instead of waiting for it.
    const timeoutSpy = jest
      .spyOn(AbortSignal, 'timeout')
      .mockImplementation(() => {
        const controller = new AbortController()
        setImmediate(() =>
          controller.abort(
            new DOMException('The operation timed out.', 'TimeoutError')
          )
        )
        return controller.signal
      })

    await expect(getVersionInfo()).resolves.toEqual({
      installed: expect.any(String),
      staleness: 'unknown',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://registry.example/-/package/next/dist-tags',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
    expect(timeoutSpy).toHaveBeenCalledTimes(1)
  })
})
