/* eslint-env jest */
import type { IncomingMessage, ServerResponse } from 'http'
import { sendResponse } from 'next/dist/server/image-optimizer'
import { imageConfigDefault } from 'next/dist/shared/lib/image-config'

function createMocks(reqHeaders: Record<string, string> = {}) {
  const resHeaders: Record<string, string | number | string[]> = {}
  const req = { method: 'GET', headers: reqHeaders } as IncomingMessage
  const res = {
    statusCode: 200,
    setHeader(name: string, value: string | number | string[]) {
      resHeaders[name.toLowerCase()] = value
      return this
    },
    getHeader(name: string) {
      return resHeaders[name.toLowerCase()]
    },
    end: jest.fn(),
  } as unknown as ServerResponse
  return { req, res, resHeaders }
}

function send(
  req: IncomingMessage,
  res: ServerResponse,
  generateEtags?: boolean
) {
  const buffer = Buffer.from('fake-image')
  const args = [
    req,
    res,
    '/_next/image?url=%2Ftest.png&w=64&q=75',
    'png',
    buffer,
    'test-etag',
    false,
    'MISS',
    imageConfigDefault,
    60,
    false,
  ] as const
  if (generateEtags === undefined) {
    sendResponse(...args)
  } else {
    sendResponse(...args, generateEtags)
  }
  return buffer
}

describe('sendResponse', () => {
  describe('generateEtags enabled (default)', () => {
    it('should set the ETag header', () => {
      const { req, res, resHeaders } = createMocks()
      const buffer = send(req, res)

      expect(resHeaders['etag']).toBe('test-etag')
      expect(res.statusCode).toBe(200)
      expect(resHeaders['content-type']).toBe('image/png')
      expect(res.end).toHaveBeenCalledWith(buffer)
    })

    it('should set the ETag header when generateEtags is true', () => {
      const { req, res, resHeaders } = createMocks()
      send(req, res, true)

      expect(resHeaders['etag']).toBe('test-etag')
    })

    it('should respond with 304 when if-none-match matches the ETag', () => {
      const { req, res, resHeaders } = createMocks({
        'if-none-match': 'test-etag',
      })
      send(req, res)

      expect(res.statusCode).toBe(304)
      expect(resHeaders['etag']).toBe('test-etag')
      expect(res.end).toHaveBeenCalledWith()
    })
  })

  describe('generateEtags disabled', () => {
    it('should not set the ETag header', () => {
      const { req, res, resHeaders } = createMocks()
      const buffer = send(req, res, false)

      expect(resHeaders['etag']).toBeUndefined()
      expect(res.statusCode).toBe(200)
      expect(resHeaders['content-type']).toBe('image/png')
      expect(resHeaders['content-length']).toBe(buffer.byteLength)
      expect(res.end).toHaveBeenCalledWith(buffer)
    })

    it('should not respond with 304 even if if-none-match matches the ETag', () => {
      const { req, res, resHeaders } = createMocks({
        'if-none-match': 'test-etag',
      })
      const buffer = send(req, res, false)

      expect(resHeaders['etag']).toBeUndefined()
      expect(res.statusCode).toBe(200)
      expect(res.end).toHaveBeenCalledWith(buffer)
    })

    it('should still set caching headers', () => {
      const { req, res, resHeaders } = createMocks()
      send(req, res, false)

      expect(resHeaders['vary']).toBe('Accept')
      expect(resHeaders['cache-control']).toBe(
        'public, max-age=60, must-revalidate'
      )
    })
  })
})
