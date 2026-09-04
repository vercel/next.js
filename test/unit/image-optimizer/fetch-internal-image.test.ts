/* eslint-env jest */
import {
  fetchInternalImage,
  ImageError,
} from 'next/dist/server/image-optimizer'
import type { ImageConfigComplete } from 'next/dist/shared/lib/image-config'
import type { IncomingMessage, ServerResponse } from 'http'

function getImagesConfig(maximumResponseBody: number, maximumRedirects = 0) {
  return {
    deviceSizes: [128],
    imageSizes: [],
    dangerouslyAllowLocalIP: false,
    maximumRedirects,
    maximumResponseBody,
  } as ImageConfigComplete
}

describe('fetchInternalImage', () => {
  describe('redirects and non-2xx responses', () => {
    it('should throw error when the internal response exceeds the redirect limit', async () => {
      const mockReq = {} as IncomingMessage
      const mockRes = {} as ServerResponse
      const maximumResponseBody = 300_000_000

      const handleRequest = jest.fn(async (_req: IncomingMessage, res: any) => {
        res.statusCode = 307
        res.getHeader = jest.fn(() => 'text/plain')
        res.write('/redirected')
        res.end()
      })

      const error = await fetchInternalImage(
        '/test-image.jpg',
        mockReq,
        mockRes,
        handleRequest,
        getImagesConfig(maximumResponseBody)
      ).catch((e) => e)

      expect(error).toBeInstanceOf(ImageError)
      expect((error as ImageError).statusCode).toBe(508)
      expect((error as ImageError).message).toBe(
        '"url" parameter is valid but internal response is invalid'
      )
    })

    it('should reject protocol-relative redirects', async () => {
      const mockReq = {} as IncomingMessage
      const mockRes = {} as ServerResponse

      const handleRequest = jest.fn(async (_req: IncomingMessage, res: any) => {
        res.statusCode = 307
        res.getHeader = jest.fn(() => '//example.com/test-image.jpg')
        res.end()
      })

      const error = await fetchInternalImage(
        '/test-image.jpg',
        mockReq,
        mockRes,
        handleRequest,
        getImagesConfig(300_000_000, 1)
      ).catch((e) => e)

      expect(error).toBeInstanceOf(ImageError)
      expect((error as ImageError).statusCode).toBe(400)
      expect((error as ImageError).message).toBe(
        '"url" parameter cannot be a protocol-relative URL (//)'
      )
    })

    it('should skip local pattern validation for internal redirects', async () => {
      const mockReq = {
        url: '/_next/image?url=%2Ftest-image.jpg&w=128&q=75',
        headers: { accept: 'image/webp' },
      } as IncomingMessage
      const mockRes = {} as ServerResponse
      const imagesConfig = getImagesConfig(300_000_000, 1)
      imagesConfig.localPatterns = [{ pathname: '/allowed.jpg' }]

      const handleRequest = jest.fn(async (req: IncomingMessage, res: any) => {
        if (req.url === '/test-image.jpg') {
          res.statusCode = 307
          res.getHeader = jest.fn(() => '/blocked.jpg')
          res.end()
        } else {
          res.statusCode = 200
          res.getHeader = jest.fn(() => 'image/jpeg')
          res.write(Buffer.from('image'))
          res.end()
        }
      })

      const result = await fetchInternalImage(
        '/test-image.jpg',
        mockReq,
        mockRes,
        handleRequest,
        imagesConfig
      )

      expect(result.buffer).toEqual(Buffer.from('image'))
      expect(handleRequest).toHaveBeenCalledTimes(2)
    })

    it('should throw error when the internal response is a 404', async () => {
      const mockReq = {} as IncomingMessage
      const mockRes = {} as ServerResponse
      const maximumResponseBody = 300_000_000

      const handleRequest = jest.fn(async (_req: IncomingMessage, res: any) => {
        res.statusCode = 404
        res.getHeader = jest.fn(() => 'text/html')
        res.write('<html>not found</html>')
        res.end()
      })

      const error = await fetchInternalImage(
        '/test-image.jpg',
        mockReq,
        mockRes,
        handleRequest,
        getImagesConfig(maximumResponseBody)
      ).catch((e) => e)

      expect(error).toBeInstanceOf(ImageError)
      expect((error as ImageError).statusCode).toBe(404)
      expect((error as ImageError).message).toBe(
        '"url" parameter is valid but internal response is invalid'
      )
    })
  })

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
        handleRequest,
        getImagesConfig(maximumResponseBody)
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
        handleRequest,
        getImagesConfig(maximumResponseBody)
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
        handleRequest,
        getImagesConfig(maximumResponseBody)
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
        handleRequest,
        getImagesConfig(maximumResponseBody)
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
        handleRequest,
        getImagesConfig(maximumResponseBody)
      )

      expect(result.buffer).toBeInstanceOf(Buffer)
      expect(result.buffer.length).toBe(maximumResponseBody)
    })
  })
})
