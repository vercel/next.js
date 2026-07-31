/**
 * @jest-environment jsdom
 */

const PAGEHIDE_LISTENER_KEY = '__nextDevToolsConfigPagehideListener'

type DevToolsWindow = Window & {
  [PAGEHIDE_LISTENER_KEY]?: () => void
}

const originalFetch = global.fetch

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

function removePagehideListener() {
  const devToolsWindow = window as DevToolsWindow
  const listener = devToolsWindow[PAGEHIDE_LISTENER_KEY]

  if (listener) {
    window.removeEventListener('pagehide', listener)
    delete devToolsWindow[PAGEHIDE_LISTENER_KEY]
  }
}

describe('saveDevToolsConfig', () => {
  let fetchMock: jest.Mock
  let warnMock: jest.SpyInstance

  beforeEach(() => {
    removePagehideListener()
    jest.resetModules()
    jest.useFakeTimers()
    fetchMock = jest.fn()
    global.fetch = fetchMock
    warnMock = jest.spyOn(console, 'warn').mockImplementation()
  })

  afterEach(async () => {
    await flushMicrotasks()
    removePagehideListener()
    jest.clearAllTimers()
    jest.useRealTimers()
    global.fetch = originalFetch
    warnMock.mockRestore()
  })

  it('serializes writes and retries a merged patch after a failed response', async () => {
    let resolveFirstRequest: (response: { ok: boolean }) => void
    let activeRequests = 0
    let maximumActiveRequests = 0

    fetchMock
      .mockImplementationOnce(() => {
        activeRequests++
        maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests)

        return new Promise<{ ok: boolean }>((resolve) => {
          resolveFirstRequest = resolve
        }).finally(() => {
          activeRequests--
        })
      })
      .mockImplementationOnce(() => {
        activeRequests++
        maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests)

        return Promise.resolve({ ok: true }).finally(() => {
          activeRequests--
        })
      })

    const { saveDevToolsConfig } = await import('./save-devtools-config')

    saveDevToolsConfig({
      requestInsights: { showInternal: true, verbose: false },
    })
    jest.advanceTimersByTime(120)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    saveDevToolsConfig({ requestInsights: { verbose: true } })
    jest.advanceTimersByTime(120)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    resolveFirstRequest!({ ok: false })
    await jest.advanceTimersByTimeAsync(0)

    await jest.advanceTimersByTimeAsync(239)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await jest.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    expect(maximumActiveRequests).toBe(1)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toStrictEqual(
      {
        requestInsights: { showInternal: true, verbose: false },
      }
    )
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toStrictEqual(
      {
        requestInsights: { showInternal: true, verbose: true },
      }
    )
  })

  it('retries a patch when fetch throws synchronously without logging it', async () => {
    fetchMock
      .mockImplementationOnce(() => {
        throw new Error('sensitive value: dark')
      })
      .mockResolvedValueOnce({ ok: true })

    const { saveDevToolsConfig } = await import('./save-devtools-config')

    saveDevToolsConfig({ theme: 'dark' })
    jest.advanceTimersByTime(120)
    await jest.advanceTimersByTimeAsync(0)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(warnMock.mock.calls)).not.toContain('dark')
    expect(JSON.stringify(warnMock.mock.calls)).not.toContain('sensitive')

    await jest.advanceTimersByTimeAsync(240)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][1]).toEqual(
      expect.objectContaining({
        body: JSON.stringify({ theme: 'dark' }),
        keepalive: true,
      })
    )
  })

  it('flushes a pending patch immediately on pagehide with keepalive', async () => {
    fetchMock.mockResolvedValue({ ok: true })

    const { saveDevToolsConfig } = await import('./save-devtools-config')

    saveDevToolsConfig({ requestInsights: { showInternal: true } })
    window.dispatchEvent(new Event('pagehide'))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      '/__nextjs_devtools_config',
      expect.objectContaining({
        body: JSON.stringify({
          requestInsights: { showInternal: true },
        }),
        keepalive: true,
      })
    )
  })

  it('flushes a queued patch on pagehide while a save is in flight', async () => {
    let resolveFirstRequest: (response: { ok: boolean }) => void
    fetchMock
      .mockImplementationOnce(
        () =>
          new Promise<{ ok: boolean }>((resolve) => {
            resolveFirstRequest = resolve
          })
      )
      .mockResolvedValueOnce({ ok: true })

    const { saveDevToolsConfig } = await import('./save-devtools-config')

    saveDevToolsConfig({ requestInsights: { showInternal: true } })
    jest.advanceTimersByTime(120)
    saveDevToolsConfig({ requestInsights: { verbose: true } })
    window.dispatchEvent(new Event('pagehide'))

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(
      fetchMock.mock.calls.map((call) => JSON.parse(call[1].body))
    ).toEqual([
      { requestInsights: { showInternal: true } },
      {
        requestInsights: {
          showInternal: true,
          verbose: true,
        },
      },
    ])
    expect(fetchMock.mock.calls[1][1]).toEqual(
      expect.objectContaining({ keepalive: true })
    )

    resolveFirstRequest!({ ok: true })
    await flushMicrotasks()
  })

  it('retries a failed pagehide flush after the in-flight save completes', async () => {
    let resolveFirstRequest: (response: { ok: boolean }) => void
    let rejectPagehideRequest: (error: Error) => void
    fetchMock
      .mockImplementationOnce(
        () =>
          new Promise<{ ok: boolean }>((resolve) => {
            resolveFirstRequest = resolve
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise<{ ok: boolean }>((_resolve, reject) => {
            rejectPagehideRequest = reject
          })
      )
      .mockResolvedValueOnce({ ok: true })

    const { saveDevToolsConfig } = await import('./save-devtools-config')

    saveDevToolsConfig({ requestInsights: { showInternal: true } })
    jest.advanceTimersByTime(120)
    saveDevToolsConfig({ requestInsights: { verbose: true } })
    window.dispatchEvent(new Event('pagehide'))

    resolveFirstRequest!({ ok: true })
    await flushMicrotasks()
    rejectPagehideRequest!(new Error('page was hidden'))
    await flushMicrotasks()

    await jest.advanceTimersByTimeAsync(0)

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[2][1]).toEqual(
      expect.objectContaining({
        body: JSON.stringify({
          requestInsights: {
            showInternal: true,
            verbose: true,
          },
        }),
        keepalive: true,
      })
    )
  })

  it('does not restore an older failed patch after a newer pagehide flush succeeds', async () => {
    let resolveFirstRequest: (response: { ok: boolean }) => void
    fetchMock
      .mockImplementationOnce(
        () =>
          new Promise<{ ok: boolean }>((resolve) => {
            resolveFirstRequest = resolve
          })
      )
      .mockResolvedValueOnce({ ok: true })

    const { saveDevToolsConfig } = await import('./save-devtools-config')

    saveDevToolsConfig({ requestInsights: { verbose: false } })
    jest.advanceTimersByTime(120)
    saveDevToolsConfig({ requestInsights: { verbose: true } })
    window.dispatchEvent(new Event('pagehide'))

    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      requestInsights: { verbose: true },
    })

    resolveFirstRequest!({ ok: false })
    await flushMicrotasks()
    await jest.advanceTimersByTimeAsync(5_000)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(warnMock).not.toHaveBeenCalled()
  })
})
