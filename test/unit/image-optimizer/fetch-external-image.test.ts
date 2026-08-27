/* eslint-env jest */
import {
  fetchExternalImage,
  ImageError,
} from 'next/dist/server/image-optimizer'
import { lookup } from 'dns/promises'
import { fetch as undiciFetch, Response as UndiciResponse } from 'undici'

jest.mock('dns/promises', () => ({
  lookup: jest.fn(),
}))
jest.mock('undici', () => ({
  ...jest.requireActual('undici'),
  fetch: jest.fn(),
}))

const lookupMock = lookup as jest.MockedFunction<typeof lookup>
const undiciFetchMock = undiciFetch as jest.MockedFunction<typeof undiciFetch>

function createImageResponse() {
  return new UndiciResponse(new Uint8Array([1, 2, 3]), {
    status: 200,
    headers: {
      'Content-Type': 'image/jpeg',
    },
  })
}

describe('fetchExternalImage', () => {
  beforeEach(() => {
    undiciFetchMock.mockReset()
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('private IP / SSRF guard', () => {
    it('should reject a literal private IP hostname with a generic error message', async () => {
      const fetchMock = jest.fn()
      global.fetch = fetchMock

      const error = await fetchExternalImage(
        'http://192.168.0.1/private.jpg',
        false,
        50_000_000
      ).catch((e) => e)

      expect(error).toBeInstanceOf(ImageError)
      expect((error as ImageError).statusCode).toBe(400)
      expect((error as ImageError).message).toBe(
        '"url" parameter is not allowed'
      )
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('should allow a literal private IP when dangerouslyAllowLocalIP is true', async () => {
      global.fetch = jest.fn().mockResolvedValue(createImageResponse())

      const result = await fetchExternalImage(
        'http://192.168.0.1/private.jpg',
        true,
        50_000_000
      )

      expect(result.buffer).toBeInstanceOf(Buffer)
      expect(global.fetch).toHaveBeenCalled()
      expect(lookupMock).not.toHaveBeenCalled()
      expect(jest.mocked(global.fetch).mock.calls[0][1]).not.toHaveProperty(
        'dispatcher'
      )
    })

    it('should pin a public hostname to the validated DNS result', async () => {
      undiciFetchMock.mockResolvedValue(createImageResponse())
      const globalFetchMock = jest.fn()
      global.fetch = globalFetchMock

      await fetchExternalImage(
        'http://example.com/public.jpg',
        false,
        50_000_000
      )

      expect(lookupMock).toHaveBeenCalledTimes(1)
      expect(lookupMock).toHaveBeenCalledWith('example.com', {
        family: 0,
        all: true,
        hints: expect.any(Number),
      })
      expect(undiciFetchMock.mock.calls[0][1]).toHaveProperty('dispatcher')
      expect(globalFetchMock).not.toHaveBeenCalled()
    })

    it('should fail closed when DNS resolution fails', async () => {
      lookupMock.mockRejectedValueOnce(new Error('DNS unavailable'))
      const fetchMock = undiciFetchMock

      const error = await fetchExternalImage(
        'http://example.com/private.jpg',
        false,
        50_000_000
      ).catch((e) => e)

      expect(error).toBeInstanceOf(ImageError)
      expect((error as ImageError).statusCode).toBe(400)
      expect((error as ImageError).message).toBe(
        '"url" parameter is not allowed'
      )
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('should fail closed when DNS returns no addresses', async () => {
      lookupMock.mockResolvedValueOnce([])
      const fetchMock = undiciFetchMock

      const error = await fetchExternalImage(
        'http://example.com/private.jpg',
        false,
        50_000_000
      ).catch((e) => e)

      expect(error).toBeInstanceOf(ImageError)
      expect((error as ImageError).statusCode).toBe(400)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('should reject the whole DNS result when any address is private', async () => {
      lookupMock.mockResolvedValueOnce([
        { address: '93.184.216.34', family: 4 },
        { address: '127.0.0.1', family: 4 },
      ])
      const fetchMock = undiciFetchMock

      const error = await fetchExternalImage(
        'http://example.com/private.jpg',
        false,
        50_000_000
      ).catch((e) => e)

      expect(error).toBeInstanceOf(ImageError)
      expect((error as ImageError).statusCode).toBe(400)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('should resolve and validate each redirect destination independently', async () => {
      lookupMock
        .mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }])
        .mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }])
      undiciFetchMock.mockResolvedValueOnce(
        new UndiciResponse(null, {
          status: 302,
          headers: { Location: 'http://private.example/image.jpg' },
        })
      )

      const error = await fetchExternalImage(
        'http://public.example/image.jpg',
        false,
        50_000_000
      ).catch((e) => e)

      expect(error).toBeInstanceOf(ImageError)
      expect((error as ImageError).statusCode).toBe(400)
      expect(lookupMock).toHaveBeenCalledTimes(2)
      expect(undiciFetchMock).toHaveBeenCalledTimes(1)
    })
  })

  describe('response size limit', () => {
    it('should throw error when response has no body', async () => {
      undiciFetchMock.mockResolvedValue(
        new UndiciResponse(null, {
          status: 200,
        })
      )

      const error = await fetchExternalImage(
        'http://example.com/no-body.jpg',
        false,
        50_000_000
      ).catch((e) => e)

      expect(error).toBeInstanceOf(ImageError)
      expect((error as ImageError).statusCode).toBe(400)
      expect((error as ImageError).message).toBe(
        '"url" parameter is valid but upstream response is invalid'
      )
    })

    it('should throw error when exceeding maximumResponseBody config on later chunk', async () => {
      const maximumResponseBody = 2_000 // 2KB custom limit
      const chunkSize = 1_000 // 1KB chunks
      const numChunks = 3 // 3KB total, exceeds custom 2KB limit

      undiciFetchMock.mockImplementation(() => {
        let chunksRead = 0
        const mockReadableStream = new ReadableStream({
          async pull(controller) {
            if (chunksRead < numChunks) {
              controller.enqueue(new Uint8Array(chunkSize))
              chunksRead++
            } else {
              controller.close()
            }
          },
        })

        return Promise.resolve(
          new UndiciResponse(mockReadableStream, {
            status: 200,
            headers: {
              'Content-Type': 'image/jpeg',
            },
          })
        )
      })

      const error = await fetchExternalImage(
        'http://example.com/custom-limit.jpg',
        false,
        maximumResponseBody
      ).catch((e) => e)

      expect(error).toBeInstanceOf(ImageError)
      expect((error as ImageError).statusCode).toBe(413)
      expect((error as ImageError).message).toBe(
        '"url" parameter is valid but upstream response is invalid'
      )
    })

    it('should throw error when exceeding maximumResponseBody config on first chunk', async () => {
      const maximumResponseBody = 2_000 // 2KB custom limit

      undiciFetchMock.mockImplementation(() => {
        const mockReadableStream = new ReadableStream({
          async pull(controller) {
            controller.enqueue(new Uint8Array(maximumResponseBody + 1))
            controller.close()
          },
        })

        return Promise.resolve(
          new UndiciResponse(mockReadableStream, {
            status: 200,
            headers: {
              'Content-Type': 'image/jpeg',
            },
          })
        )
      })

      const error = await fetchExternalImage(
        'http://example.com/custom-limit.jpg',
        false,
        maximumResponseBody
      ).catch((e) => e)

      expect(error).toBeInstanceOf(ImageError)
      expect((error as ImageError).statusCode).toBe(413)
      expect((error as ImageError).message).toBe(
        '"url" parameter is valid but upstream response is invalid'
      )
    })

    it('should succeed when exactly matching maximumResponseBody config on first chunk', async () => {
      const maximumResponseBody = 3_000 // 3KB custom limit

      undiciFetchMock.mockImplementation(() => {
        const mockReadableStream = new ReadableStream({
          async pull(controller) {
            controller.enqueue(new Uint8Array(maximumResponseBody))
            controller.close()
          },
        })

        return Promise.resolve(
          new UndiciResponse(mockReadableStream, {
            status: 200,
            headers: {
              'Content-Type': 'image/jpeg',
            },
          })
        )
      })

      const result = await fetchExternalImage(
        'http://example.com/custom-limit.jpg',
        false,
        maximumResponseBody
      )

      expect(result.buffer).toBeInstanceOf(Buffer)
      expect(result.buffer.length).toBe(maximumResponseBody)
    })

    it('should succeed when exactly matching maximumResponseBody config on later chunk', async () => {
      const maximumResponseBody = 3_000 // 3KB custom limit
      const chunkSize = 1_000 // 1KB chunks
      const numChunks = 3 // 3KB total

      undiciFetchMock.mockImplementation(() => {
        let chunksRead = 0
        const mockReadableStream = new ReadableStream({
          async pull(controller) {
            if (chunksRead < numChunks) {
              controller.enqueue(new Uint8Array(chunkSize))
              chunksRead++
            } else {
              controller.close()
            }
          },
        })

        return Promise.resolve(
          new UndiciResponse(mockReadableStream, {
            status: 200,
            headers: {
              'Content-Type': 'image/jpeg',
            },
          })
        )
      })

      const result = await fetchExternalImage(
        'http://example.com/custom-limit.jpg',
        false,
        maximumResponseBody
      )

      expect(result.buffer).toBeInstanceOf(Buffer)
      expect(result.buffer.length).toBe(maximumResponseBody)
    })
  })
})
