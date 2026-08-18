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

  describe('when the requester goes away', () => {
    // The internal request is shared by every client waiting on the same
    // transform, so it must survive any single one of them disconnecting.
    it('completes even though the requesting socket is already closed', async () => {
      const size = 4 * 1024 * 1024
      const filePath = join(tmpdir(), `fetch-internal-image-disconnect.bin`)
      await fs.writeFile(filePath, Buffer.alloc(size, 1))

      // `send` decides a response is done by watching the socket through
      // `on-finished`; a disconnected client reports `writable: false`.
      const closedSocket = Object.assign(new EventEmitter(), {
        writable: false,
      })
      const mockReq = {
        method: 'GET',
        socket: closedSocket,
      } as unknown as IncomingMessage
      const mockRes = {} as ServerResponse

      let hungTimer: ReturnType<typeof setTimeout> | undefined
      try {
        const result = await Promise.race([
          fetchInternalImage(
            '/test-image.jpg',
            mockReq,
            mockRes,
            50_000_000,
            (req, res) => serveStatic(req, res, filePath)
          ),
          new Promise((resolve) => {
            hungTimer = setTimeout(() => resolve('hung'), 5_000)
          }),
        ])

        expect(result).not.toBe('hung')
        expect((result as { buffer: Buffer }).buffer.length).toBe(size)
      } finally {
        if (hungTimer) clearTimeout(hungTimer)
        await fs.unlink(filePath).catch(() => {})
      }
    })

    // Safety net: whatever the reason, the promise has to settle, because
    // `ResponseCache` only releases the coalesced cache key once it does.
    it('rejects rather than hanging when the response never finishes', async () => {
      jest.useFakeTimers()

      try {
        const mockReq = { method: 'GET' } as IncomingMessage
        const mockRes = {} as ServerResponse

        const handleRequest = jest.fn(
          async (_req: IncomingMessage, res: any) => {
            res.statusCode = 200
            res.getHeader = jest.fn(() => 'image/jpeg')
            res.write(Buffer.alloc(16))
            // Deliberately never calls `res.end()`.
          }
        )

        const pending = fetchInternalImage(
          '/test-image.jpg',
          mockReq,
          mockRes,
          50_000_000,
          handleRequest
        ).catch((e) => e)

        await jest.advanceTimersByTimeAsync(30_000)

        const error = await pending
        expect(error).toBeInstanceOf(ImageError)
      } finally {
        jest.useRealTimers()
      }
    })
  })
})
