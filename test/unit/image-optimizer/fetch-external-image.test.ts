/* eslint-env jest */
import { fetchExternalImage } from 'next/dist/server/image-optimizer'

describe('fetchExternalImage', () => {
  const href = 'https://example.com/test.jpg'
  const originalFetch = global.fetch
  const timeoutErrorCases = [
    {
      name: 'TimeoutError',
      build: () => {
        const err = new Error('Request timed out')
        err.name = 'TimeoutError'
        return err
      },
    },
    {
      name: 'AbortError',
      build: () => {
        const err = new Error('The operation was aborted')
        err.name = 'AbortError'
        return err
      },
    },
    {
      name: 'TimeoutError cause',
      build: () => {
        const cause = new Error('Upstream timed out')
        cause.name = 'TimeoutError'
        const err = new Error('Request failed')
        err.cause = cause
        return err
      },
    },
    {
      name: 'AbortError cause',
      build: () => {
        const cause = new Error('Upstream aborted')
        cause.name = 'AbortError'
        const err = new Error('Request failed')
        err.cause = cause
        return err
      },
    },
  ]

  afterEach(() => {
    global.fetch = originalFetch
  })

  it.each(timeoutErrorCases)(
    'maps $name to a 504 ImageError with a stable code',
    async ({ build }) => {
      global.fetch = jest.fn().mockRejectedValue(build())

      await expect(fetchExternalImage(href, true, 0, 1)).rejects.toMatchObject({
        statusCode: 504,
        code: 'IMAGE_FETCH_TIMEOUT',
      })
    }
  )

  it('does not map non-timeout errors to IMAGE_FETCH_TIMEOUT', async () => {
    const err = new TypeError('fetch failed')
    global.fetch = jest.fn().mockRejectedValue(err)

    await expect(fetchExternalImage(href, true, 0, 1)).rejects.toBe(err)
  })

  it('does not apply a timeout when set to 0', async () => {
    const headers = new Map([
      ['Content-Type', 'image/jpeg'],
      ['Cache-Control', 'public, max-age=60'],
      ['ETag', 'etag'],
    ])
    const res = {
      ok: true,
      status: 200,
      headers,
      arrayBuffer: jest
        .fn()
        .mockResolvedValue(new Uint8Array([0xff, 0xd8, 0xff])),
    }
    const fetchMock = jest.fn().mockResolvedValue(res)
    global.fetch = fetchMock

    const result = await fetchExternalImage(href, true, 0, 0)

    const [, requestInit] = fetchMock.mock.calls[0]
    expect(requestInit).toEqual({ redirect: 'manual' })
    expect(Buffer.isBuffer(result.buffer)).toBe(true)
  })
})
