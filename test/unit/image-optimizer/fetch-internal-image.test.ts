/* eslint-env jest */
import {
  fetchInternalImage,
  imageOptimizer,
  ImageError,
} from 'next/dist/server/image-optimizer'
import type { IncomingMessage, ServerResponse } from 'http'

describe('fetchInternalImage', () => {
  describe('response size limit', () => {
    it('should throw error when response has no buffers', async () => {
      const mockReq = {} as IncomingMessage
      const mockRes = {} as ServerResponse
      const maximumResponseBody = 300_000_000

      const handleRequest = jest.fn(async (_req: IncomingMessage, res: any) => {
        res.statusCode = 200
        res.getHeader = jest.fn(() => 'image/jpeg')
        res.end()
      })

      const error = await fetchInternalImage(
        '/test-image.jpg',
        mockReq,
        mockRes,
        maximumResponseBody,
        handleRequest
      ).catch((e) => e)

      expect(error).toBeInstanceOf(ImageError)
      expect((error as ImageError).statusCode).toBe(400)
      expect((error as ImageError).message).toBe(
        '"url" parameter is valid but internal response is invalid'
      )
    })

    it('should throw error when exceeding maximumResponseBody config on later chunk', async () => {
      const maximumResponseBody = 2_000 // 2KB custom limit
      const chunkSize = 1_000 // 1KB chunks
      const numChunks = 3 // 3KB total, exceeds custom 2KB limit

      const mockReq = {} as IncomingMessage
      const mockRes = {} as ServerResponse

      const handleRequest = jest.fn(async (_req: IncomingMessage, res: any) => {
        res.statusCode = 200
        res.getHeader = jest.fn(() => 'image/jpeg')

        for (let i = 0; i < numChunks; i++) {
          res.write(Buffer.alloc(chunkSize))
        }
        res.end()
      })

      const error = await fetchInternalImage(
        '/test-image.jpg',
        mockReq,
        mockRes,
        maximumResponseBody,
        handleRequest
      ).catch((e) => e)

      expect(error).toBeInstanceOf(ImageError)
      expect((error as ImageError).statusCode).toBe(413)
      expect((error as ImageError).message).toBe(
        '"url" parameter is valid but internal response is invalid'
      )
    })

    it('should throw error when exceeding maximumResponseBody config on first chunk', async () => {
      const maximumResponseBody = 2_000 // 2KB custom limit

      const mockReq = {} as IncomingMessage
      const mockRes = {} as ServerResponse

      const handleRequest = jest.fn(async (_req: IncomingMessage, res: any) => {
        res.statusCode = 200
        res.getHeader = jest.fn(() => 'image/jpeg')
        res.write(Buffer.alloc(maximumResponseBody + 1))
        res.end()
      })

      const error = await fetchInternalImage(
        '/test-image.jpg',
        mockReq,
        mockRes,
        maximumResponseBody,
        handleRequest
      ).catch((e) => e)

      expect(error).toBeInstanceOf(ImageError)
      expect((error as ImageError).statusCode).toBe(413)
      expect((error as ImageError).message).toBe(
        '"url" parameter is valid but internal response is invalid'
      )
    })

    it('should succeed when exactly matching maximumResponseBody config on first chunk', async () => {
      const maximumResponseBody = 3_000 // 3KB custom limit

      const mockReq = {} as IncomingMessage
      const mockRes = {} as ServerResponse

      const handleRequest = jest.fn(async (_req: IncomingMessage, res: any) => {
        res.statusCode = 200
        res.getHeader = jest.fn(() => 'image/jpeg')
        res.write(Buffer.alloc(maximumResponseBody))
        res.end()
      })

      const result = await fetchInternalImage(
        '/test-image.jpg',
        mockReq,
        mockRes,
        maximumResponseBody,
        handleRequest
      )

      expect(result.buffer).toBeInstanceOf(Buffer)
      expect(result.buffer.length).toBe(maximumResponseBody)
    })

    it('should succeed when exactly matching maximumResponseBody config on later chunk', async () => {
      const maximumResponseBody = 3_000 // 3KB custom limit
      const chunkSize = 1_000 // 1KB chunks
      const numChunks = 3 // 3KB total

      const mockReq = {} as IncomingMessage
      const mockRes = {} as ServerResponse

      const handleRequest = jest.fn(async (_req: IncomingMessage, res: any) => {
        res.statusCode = 200
        res.getHeader = jest.fn(() => 'image/jpeg')

        for (let i = 0; i < numChunks; i++) {
          res.write(Buffer.alloc(chunkSize))
        }
        res.end()
      })

      const result = await fetchInternalImage(
        '/test-image.jpg',
        mockReq,
        mockRes,
        maximumResponseBody,
        handleRequest
      )

      expect(result.buffer).toBeInstanceOf(Buffer)
      expect(result.buffer.length).toBe(maximumResponseBody)
    })
  })

  it('should include the response status when the image type is invalid', async () => {
    const mockReq = {} as IncomingMessage
    const mockRes = {} as ServerResponse
    const handleRequest = jest.fn(
      async (_req: IncomingMessage, res: ServerResponse) => {
        res.statusCode = 307
        res.write('Redirecting')
        res.end()
      }
    )

    const upstreamImage = await fetchInternalImage(
      '/redirected-image.png',
      mockReq,
      mockRes,
      50_000_000,
      handleRequest
    )

    expect(upstreamImage).toMatchObject({
      contentType: undefined,
      statusCode: 307,
    })

    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {})

    try {
      const error = await imageOptimizer(
        upstreamImage,
        {
          href: '/redirected-image.png',
          width: 640,
          quality: 75,
          mimeType: 'image/webp',
        },
        {
          experimental: {},
          images: {
            dangerouslyAllowSVG: false,
            minimumCacheTTL: 60,
          },
        } as Parameters<typeof imageOptimizer>[2],
        {}
      ).catch((e) => e)

      expect(error).toBeInstanceOf(ImageError)
      expect(consoleError).toHaveBeenCalledWith(
        expect.any(String),
        "The requested resource isn't a valid image for",
        '/redirected-image.png',
        'received',
        null,
        'with status',
        307
      )
    } finally {
      consoleError.mockRestore()
    }
  })
})
