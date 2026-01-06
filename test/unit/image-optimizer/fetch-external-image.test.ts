/* eslint-env jest */
import {
  fetchExternalImage,
  ImageError,
} from 'next/dist/server/image-optimizer'

describe('fetchExternalImage', () => {
  describe('response size limit', () => {
    it('should throw error when response has no body', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: null,
        headers: {
          get: jest.fn(() => null),
        },
      })

      const error = await fetchExternalImage(
        'http://example.com/no-body.jpg',
        false,
        300_000_000
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

      global.fetch = jest.fn().mockImplementation(() => {
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

        return Promise.resolve({
          ok: true,
          status: 200,
          body: mockReadableStream,
          headers: {
            get: jest.fn((header: string) => {
              if (header === 'Content-Type') return 'image/jpeg'
              return null
            }),
          },
        })
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

      global.fetch = jest.fn().mockImplementation(() => {
        const mockReadableStream = new ReadableStream({
          async pull(controller) {
            controller.enqueue(new Uint8Array(maximumResponseBody + 1))
            controller.close()
          },
        })

        return Promise.resolve({
          ok: true,
          status: 200,
          body: mockReadableStream,
          headers: {
            get: jest.fn((header: string) => {
              if (header === 'Content-Type') return 'image/jpeg'
              return null
            }),
          },
        })
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

      global.fetch = jest.fn().mockImplementation(() => {
        const mockReadableStream = new ReadableStream({
          async pull(controller) {
            controller.enqueue(new Uint8Array(maximumResponseBody))
            controller.close()
          },
        })

        return Promise.resolve({
          ok: true,
          status: 200,
          body: mockReadableStream,
          headers: {
            get: jest.fn((header: string) => {
              if (header === 'Content-Type') return 'image/jpeg'
              return null
            }),
          },
        })
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

      global.fetch = jest.fn().mockImplementation(() => {
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

        return Promise.resolve({
          ok: true,
          status: 200,
          body: mockReadableStream,
          headers: {
            get: jest.fn((header: string) => {
              if (header === 'Content-Type') return 'image/jpeg'
              return null
            }),
          },
        })
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
