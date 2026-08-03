/* eslint-env jest */
import {
  fetchInternalImage,
  ImageError,
} from 'next/dist/server/image-optimizer'
import { serveStatic } from 'next/dist/server/serve-static'
import type { IncomingMessage, ServerResponse } from 'http'
import { EventEmitter } from 'events'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

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

  describe('requester disconnect', () => {
    it('should still complete when the requester socket is already gone', async () => {
      const size = 4 * 1024 * 1024
      const filePath = join(tmpdir(), `fetch-internal-image-${Date.now()}.bin`)
      await fs.writeFile(filePath, Buffer.alloc(size, 1))

      // A disconnected client's socket reports `writable: false`, which is what
      // `send` reads to decide the response is done and destroy the stream.
      const socket = Object.assign(new EventEmitter(), { writable: false })
      const mockReq = { method: 'GET', socket } as unknown as IncomingMessage
      const mockRes = {} as ServerResponse

      try {
        const result = await Promise.race([
          fetchInternalImage(
            '/test-image.jpg',
            mockReq,
            mockRes,
            50_000_000,
            (req, res) => serveStatic(req, res, filePath)
          ),
          new Promise((resolve) => setTimeout(() => resolve('timeout'), 5_000)),
        ])

        expect(result).not.toBe('timeout')
        expect((result as { buffer: Buffer }).buffer.length).toBe(size)
      } finally {
        await fs.unlink(filePath).catch(() => {})
      }
    })
  })
})
