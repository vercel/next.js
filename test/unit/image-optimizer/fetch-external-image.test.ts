/* eslint-env jest */
import {
  fetchExternalImage,
  ImageError,
} from 'next/dist/server/image-optimizer'

describe('fetchExternalImage', () => {
  describe('response size limit', () => {
    it('should successfully fetch an image under 300MB', async () => {
      const mockImageData = Buffer.alloc(1024 * 1024) // 1MB
      const mockReadableStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(mockImageData))
          controller.close()
        },
      })

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: mockReadableStream,
        headers: {
          get: jest.fn((header: string) => {
            if (header === 'Content-Type') return 'image/jpeg'
            if (header === 'Cache-Control') return 'public, max-age=3600'
            if (header === 'ETag') return '"test-etag"'
            return null
          }),
        },
      })

      const result = await fetchExternalImage(
        'http://example.com/image.jpg',
        false
      )

      expect(result.buffer).toBeInstanceOf(Buffer)
      expect(result.contentType).toBe('image/jpeg')
      expect(result.cacheControl).toBe('public, max-age=3600')
    })

    it('should abort and throw error when response exceeds 300MB', async () => {
      const chunkSize = 50_000_000 // 50MB chunks
      // We create 8 chunks (400MB) to ensure stream has more data available
      const numChunks = 8

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
              if (header === 'Cache-Control') return 'public, max-age=3600'
              if (header === 'ETag') return null
              return null
            }),
          },
        })
      })

      const error = await fetchExternalImage(
        'http://example.com/large-image.jpg',
        false
      ).catch((e) => e)
      expect(error).toBeInstanceOf(ImageError)
      expect((error as ImageError).statusCode).toBe(413)
      expect((error as ImageError).message).toBe(
        '"url" parameter is valid but upstream response is invalid'
      )
    })

    it('should throw 413 status code for oversized response', async () => {
      const chunkSize = 100_000_000 // 100MB chunks
      const numChunks = 4 // 400MB total

      const mockReadableStream = new ReadableStream({
        async start(controller) {
          for (let i = 0; i < numChunks; i++) {
            controller.enqueue(new Uint8Array(chunkSize))
          }
          controller.close()
        },
      })

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: mockReadableStream,
        headers: {
          get: jest.fn(() => null),
        },
      })

      const error = await fetchExternalImage(
        'http://example.com/huge-image.jpg',
        false
      ).catch((e) => e)
      expect(error).toBeInstanceOf(ImageError)
      expect((error as ImageError).statusCode).toBe(413)
      expect((error as ImageError).message).toBe(
        '"url" parameter is valid but upstream response is invalid'
      )
    })

    it('should handle response exactly at 300MB limit', async () => {
      const exactSize = 300_000_000 // Exactly 300MB
      const mockImageData = Buffer.alloc(exactSize)

      const mockReadableStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(mockImageData))
          controller.close()
        },
      })

      global.fetch = jest.fn().mockResolvedValue({
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

      const result = await fetchExternalImage(
        'http://example.com/exact-size.jpg',
        false
      )

      expect(result.buffer).toBeInstanceOf(Buffer)
      expect(result.buffer.length).toBe(exactSize)
    })

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
        false
      ).catch((e) => e)

      expect(error).toBeInstanceOf(ImageError)
      expect((error as ImageError).statusCode).toBe(400)
      expect((error as ImageError).message).toBe(
        '"url" parameter is valid but upstream response is invalid'
      )
    })
  })
})
