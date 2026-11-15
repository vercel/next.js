/* eslint-env jest */
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'http'
import type { AddressInfo } from 'net'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { brotliCompressSync, deflateRawSync, deflateSync, gzipSync } from 'zlib'
import {
  fetchExternalImage,
  ImageError,
} from 'next/dist/server/image-optimizer'
import { detectContentType } from 'next/dist/server/image-optimizer/detect-content-type'

jest.mock('dns/promises', () => {
  const actual = jest.requireActual('dns/promises')
  return { ...actual, lookup: jest.fn(actual.lookup) }
})

jest.mock('next/dist/server/is-private-ip', () => {
  const actual = jest.requireActual('next/dist/server/is-private-ip')
  return { ...actual, isPrivateIp: jest.fn(actual.isPrivateIp) }
})

const { lookup: lookupMock } =
  jest.requireMock<typeof import('dns/promises')>('dns/promises')
const { isPrivateIp: isPrivateIpMock } = jest.requireMock<
  typeof import('next/dist/server/is-private-ip')
>('next/dist/server/is-private-ip')

const MAXIMUM_RESPONSE_BODY = 50_000_000
const actualLookup =
  jest.requireActual<typeof import('dns/promises')>('dns/promises').lookup
const actualIsPrivateIp = jest.requireActual<
  typeof import('next/dist/server/is-private-ip')
>('next/dist/server/is-private-ip').isPrivateIp

let server: Server
let handler: (req: IncomingMessage, res: ServerResponse) => void
let requests: string[]

function port() {
  return (server.address() as AddressInfo).port
}

function origin() {
  return `http://127.0.0.1:${port()}`
}

beforeAll(async () => {
  server = createServer((req, res) => {
    requests.push(req.url ?? '')
    // The client destroys the socket when a response is too large, so writes
    // from these handlers are expected to fail
    res.on('error', () => {})
    handler(req, res)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

beforeEach(() => {
  requests = []
  handler = (_req, res) => {
    res.writeHead(200, { 'content-type': 'image/jpeg' })
    res.end(Buffer.from([0xff, 0xd8, 0xff]))
  }
})

afterEach(() => {
  jest.mocked(lookupMock).mockReset().mockImplementation(actualLookup)
  jest.mocked(isPrivateIpMock).mockReset().mockImplementation(actualIsPrivateIp)
})

describe('fetchExternalImage', () => {
  describe('private IP / SSRF guard', () => {
    it('should reject a literal private IP hostname with a generic error message', async () => {
      const error = await fetchExternalImage(
        `${origin()}/private.jpg`,
        false,
        MAXIMUM_RESPONSE_BODY
      ).catch((e) => e)

      expect(error).toBeInstanceOf(ImageError)
      expect((error as ImageError).statusCode).toBe(400)
      expect((error as ImageError).message).toBe(
        '"url" parameter is not allowed'
      )
      expect(requests).toHaveLength(0)
    })

    it('should reject a hostname that resolves to a private IP', async () => {
      jest
        .mocked(lookupMock)
        .mockResolvedValueOnce([{ address: '10.0.0.1', family: 4 }] as any)

      const error = await fetchExternalImage(
        'http://internal.invalid/private.jpg',
        false,
        MAXIMUM_RESPONSE_BODY
      ).catch((e) => e)

      expect(error).toBeInstanceOf(ImageError)
      expect((error as ImageError).statusCode).toBe(400)
      expect((error as ImageError).message).toBe(
        '"url" parameter is not allowed'
      )
      expect(requests).toHaveLength(0)
    })

    it('should allow a literal private IP when dangerouslyAllowLocalIP is true', async () => {
      const result = await fetchExternalImage(
        `${origin()}/private.jpg`,
        true,
        MAXIMUM_RESPONSE_BODY
      )

      expect(result.buffer).toEqual(Buffer.from([0xff, 0xd8, 0xff]))
      expect(requests).toEqual(['/private.jpg'])
    })

    it('should skip the DNS lookup for a literal IP', async () => {
      await fetchExternalImage(
        `${origin()}/literal.jpg`,
        true,
        MAXIMUM_RESPONSE_BODY
      )

      expect(lookupMock).not.toHaveBeenCalled()
    })
  })

  describe('DNS pinning', () => {
    it('should connect to the address that was checked instead of resolving again', async () => {
      // `.invalid` never resolves, so the request can only succeed if the
      // socket uses the address that `isPrivateIp()` already approved
      jest
        .mocked(lookupMock)
        .mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }] as any)
      jest.mocked(isPrivateIpMock).mockReturnValueOnce(false)

      const result = await fetchExternalImage(
        `http://pinned.invalid:${port()}/pinned.jpg`,
        false,
        MAXIMUM_RESPONSE_BODY
      )

      expect(result.buffer).toEqual(Buffer.from([0xff, 0xd8, 0xff]))
      expect(requests).toEqual(['/pinned.jpg'])
      expect(lookupMock).toHaveBeenCalledTimes(1)
      expect(lookupMock).toHaveBeenCalledWith(
        'pinned.invalid',
        expect.objectContaining({ all: true })
      )
    })

    it('should send the original hostname in the Host header', async () => {
      jest
        .mocked(lookupMock)
        .mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }] as any)
      jest.mocked(isPrivateIpMock).mockReturnValueOnce(false)

      let host: string | undefined
      handler = (req, res) => {
        host = req.headers.host
        res.writeHead(200, { 'content-type': 'image/jpeg' })
        res.end(Buffer.from([0xff, 0xd8, 0xff]))
      }

      await fetchExternalImage(
        `http://pinned.invalid:${port()}/host.jpg`,
        false,
        MAXIMUM_RESPONSE_BODY
      )

      expect(host).toBe(`pinned.invalid:${port()}`)
    })

    it('should not reuse a permissive socket for a protected request', async () => {
      const sockets = new Set()
      handler = (req, res) => {
        sockets.add(req.socket)
        res.writeHead(200, { 'content-type': 'image/jpeg' })
        res.end(Buffer.from([0xff, 0xd8, 0xff]))
      }
      jest.mocked(isPrivateIpMock).mockReturnValueOnce(false)

      await fetchExternalImage(
        `${origin()}/permissive.jpg`,
        true,
        MAXIMUM_RESPONSE_BODY
      )
      await fetchExternalImage(
        `${origin()}/protected.jpg`,
        false,
        MAXIMUM_RESPONSE_BODY
      )

      expect(sockets.size).toBe(2)
    })

    it('should pool permissive sockets separately', async () => {
      const sockets = new Set()
      handler = (req, res) => {
        sockets.add(req.socket)
        res.writeHead(200, { 'content-type': 'image/jpeg' })
        res.end(Buffer.from([0xff, 0xd8, 0xff]))
      }

      const href = `${origin()}/permissive.jpg`
      await fetchExternalImage(href, true, MAXIMUM_RESPONSE_BODY)
      await fetchExternalImage(href, true, MAXIMUM_RESPONSE_BODY)

      expect(sockets.size).toBe(1)
    })

    it('should pool protected sockets', async () => {
      const sockets = new Set()
      handler = (req, res) => {
        sockets.add(req.socket)
        res.writeHead(200, { 'content-type': 'image/jpeg' })
        res.end(Buffer.from([0xff, 0xd8, 0xff]))
      }
      jest
        .mocked(lookupMock)
        .mockResolvedValue([{ address: '127.0.0.1', family: 4 }] as any)
      jest.mocked(isPrivateIpMock).mockReturnValue(false)

      const href = `http://protected.invalid:${port()}/protected.jpg`
      await fetchExternalImage(href, false, MAXIMUM_RESPONSE_BODY)
      await fetchExternalImage(href, false, MAXIMUM_RESPONSE_BODY)

      expect(sockets.size).toBe(1)
      expect(lookupMock).toHaveBeenCalledTimes(2)
    })

    it('should reject a private DNS answer before reusing a protected socket', async () => {
      jest
        .mocked(lookupMock)
        .mockResolvedValue([{ address: '127.0.0.1', family: 4 }] as any)
      jest
        .mocked(isPrivateIpMock)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true)

      const href = `http://revalidate.invalid:${port()}/protected.jpg`
      await fetchExternalImage(href, false, MAXIMUM_RESPONSE_BODY)
      const error = await fetchExternalImage(
        href,
        false,
        MAXIMUM_RESPONSE_BODY
      ).catch((e) => e)

      expect(error).toBeInstanceOf(ImageError)
      expect((error as ImageError).statusCode).toBe(400)
      expect(requests).toEqual(['/protected.jpg'])
    })

    it('should not reuse a socket for a different validated address', async () => {
      const sockets = new Set()
      handler = (req, res) => {
        sockets.add(req.socket)
        res.writeHead(200, { 'content-type': 'image/jpeg' })
        res.end(Buffer.from([0xff, 0xd8, 0xff]))
      }
      jest
        .mocked(lookupMock)
        .mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }] as any)
        .mockResolvedValueOnce([
          { address: '127.0.0.1', family: 4 },
          { address: '127.0.0.2', family: 4 },
        ] as any)
      jest.mocked(isPrivateIpMock).mockReturnValue(false)

      const href = `http://rebound.invalid:${port()}/protected.jpg`
      await fetchExternalImage(href, false, MAXIMUM_RESPONSE_BODY)
      await fetchExternalImage(href, false, MAXIMUM_RESPONSE_BODY)

      expect(sockets.size).toBe(2)
      expect(lookupMock).toHaveBeenCalledTimes(2)
    })
  })

  describe('response handling', () => {
    it('should send the same default headers as fetch', async () => {
      let headers: IncomingMessage['headers'] | undefined
      handler = (req, res) => {
        headers = req.headers
        res.writeHead(200, { 'content-type': 'image/jpeg' })
        res.end(Buffer.from([0xff, 0xd8, 0xff]))
      }

      await fetchExternalImage(
        `${origin()}/headers.jpg`,
        true,
        MAXIMUM_RESPONSE_BODY
      )

      expect(headers).toEqual({
        accept: '*/*',
        'accept-encoding': 'gzip, deflate',
        'accept-language': '*',
        connection: 'keep-alive',
        host: `127.0.0.1:${port()}`,
        'sec-fetch-mode': 'cors',
        'user-agent': 'node',
      })
    })

    it('should return the content type, cache control and etag', async () => {
      handler = (_req, res) => {
        res.writeHead(200, {
          'content-type': 'image/png',
          'cache-control': 'public, max-age=600',
          etag: '"upstream-etag"',
        })
        res.end(Buffer.from([1, 2, 3]))
      }

      const result = await fetchExternalImage(
        `${origin()}/headers.png`,
        true,
        MAXIMUM_RESPONSE_BODY
      )

      expect(result.contentType).toBe('image/png')
      expect(result.cacheControl).toBe('public, max-age=600')
      expect(result.etag).toBe(
        Buffer.from('"upstream-etag"').toString('base64url')
      )
    })

    it('should throw error when the upstream response is not ok', async () => {
      handler = (_req, res) => {
        res.writeHead(404)
        res.end()
      }

      const error = await fetchExternalImage(
        `${origin()}/missing.jpg`,
        true,
        MAXIMUM_RESPONSE_BODY
      ).catch((e) => e)

      expect(error).toBeInstanceOf(ImageError)
      expect((error as ImageError).statusCode).toBe(404)
      expect((error as ImageError).message).toBe(
        '"url" parameter is valid but upstream response is invalid'
      )
    })

    it('should throw error when response has no body', async () => {
      handler = (_req, res) => {
        res.writeHead(200, { 'content-type': 'image/jpeg' })
        res.end()
      }

      const error = await fetchExternalImage(
        `${origin()}/no-body.jpg`,
        true,
        MAXIMUM_RESPONSE_BODY
      ).catch((e) => e)

      expect(error).toBeInstanceOf(ImageError)
      expect((error as ImageError).statusCode).toBe(400)
      expect((error as ImageError).message).toBe(
        '"url" parameter is valid but upstream response is invalid'
      )
    })

    it.each([
      ['gzip', 'gzip', gzipSync],
      ['Brotli', 'br', brotliCompressSync],
      ['zlib-wrapped deflate', 'deflate', deflateSync],
      ['raw deflate', 'deflate', deflateRawSync],
    ])(
      'should decompress a %s-encoded SVG response',
      async (_name, encoding, zip) => {
        const svg = await readFile(join(__dirname, 'images/test.svg'))
        handler = (_req, res) => {
          res.writeHead(200, {
            'content-encoding': encoding,
            'content-type': 'image/svg+xml',
          })
          res.end(zip(svg))
        }

        const result = await fetchExternalImage(
          `${origin()}/compressed.svg`,
          true,
          MAXIMUM_RESPONSE_BODY
        )

        expect(result.buffer).toEqual(svg)
        expect(result.contentType).toBe('image/svg+xml')
        expect(await detectContentType(result.buffer)).toBe('image/svg+xml')
      }
    )

    it('should decompress chained content encodings', async () => {
      const svg = await readFile(join(__dirname, 'images/test.svg'))
      handler = (_req, res) => {
        res.writeHead(200, {
          'content-encoding': 'gzip, br',
          'content-type': 'image/svg+xml',
        })
        res.end(brotliCompressSync(gzipSync(svg)))
      }

      const result = await fetchExternalImage(
        `${origin()}/compressed.svg`,
        true,
        MAXIMUM_RESPONSE_BODY
      )

      expect(result.buffer).toEqual(svg)
    })

    it('should decompress five chained content encodings', async () => {
      const svg = await readFile(join(__dirname, 'images/test.svg'))
      let body = svg
      for (let i = 0; i < 5; i++) {
        body = gzipSync(body)
      }
      handler = (_req, res) => {
        res.writeHead(200, {
          'content-encoding': 'gzip, gzip, gzip, gzip, gzip',
          'content-type': 'image/svg+xml',
        })
        res.end(body)
      }

      const result = await fetchExternalImage(
        `${origin()}/compressed.svg`,
        true,
        MAXIMUM_RESPONSE_BODY
      )

      expect(result.buffer).toEqual(svg)
    })

    it('should reject more than five chained content encodings', async () => {
      const svg = await readFile(join(__dirname, 'images/test.svg'))
      let body = svg
      for (let i = 0; i < 6; i++) {
        body = gzipSync(body)
      }
      handler = (_req, res) => {
        res.writeHead(200, {
          'content-encoding': 'gzip, gzip, gzip, gzip, gzip, gzip',
          'content-type': 'image/svg+xml',
        })
        res.end(body)
      }

      const error = await fetchExternalImage(
        `${origin()}/compressed.svg`,
        true,
        MAXIMUM_RESPONSE_BODY
      ).catch((e) => e)

      expect(error).toBeInstanceOf(ImageError)
      expect((error as ImageError).statusCode).toBe(400)
      expect((error as ImageError).message).toBe(
        '"url" parameter is valid but upstream response is invalid'
      )
    })

    it('should reject an over-long content-encoding header without a body', async () => {
      handler = (_req, res) => {
        res.writeHead(200, {
          'content-encoding': Array(1000).fill('gzip').join(', '),
          'content-type': 'image/svg+xml',
        })
        res.end()
      }

      const error = await fetchExternalImage(
        `${origin()}/compressed.svg`,
        true,
        MAXIMUM_RESPONSE_BODY
      ).catch((e) => e)

      expect(error).toBeInstanceOf(ImageError)
      expect((error as ImageError).statusCode).toBe(400)
      expect((error as ImageError).message).toBe(
        '"url" parameter is valid but upstream response is invalid'
      )
    })

    it('should enforce maximumResponseBody on decompressed bytes', async () => {
      const maximumResponseBody = 2_000
      handler = (_req, res) => {
        res.writeHead(200, {
          'content-encoding': 'gzip',
          'content-type': 'image/svg+xml',
        })
        res.end(gzipSync(Buffer.alloc(maximumResponseBody + 1)))
      }

      const error = await fetchExternalImage(
        `${origin()}/compressed.svg`,
        true,
        maximumResponseBody
      ).catch((e) => e)

      expect(error).toBeInstanceOf(ImageError)
      expect((error as ImageError).statusCode).toBe(413)
    })

    it('should follow a redirect', async () => {
      handler = (req, res) => {
        if (req.url === '/redirect.jpg') {
          res.writeHead(302, { location: '/final.jpg' })
          return res.end()
        }
        res.writeHead(200, { 'content-type': 'image/jpeg' })
        res.end(Buffer.from([4, 5, 6]))
      }

      const result = await fetchExternalImage(
        `${origin()}/redirect.jpg`,
        true,
        MAXIMUM_RESPONSE_BODY
      )

      expect(result.buffer).toEqual(Buffer.from([4, 5, 6]))
      expect(requests).toEqual(['/redirect.jpg', '/final.jpg'])
    })

    it('should throw error when there are too many redirects', async () => {
      handler = (_req, res) => {
        res.writeHead(302, { location: '/loop.jpg' })
        res.end()
      }

      const error = await fetchExternalImage(
        `${origin()}/loop.jpg`,
        true,
        MAXIMUM_RESPONSE_BODY,
        0
      ).catch((e) => e)

      expect(error).toBeInstanceOf(ImageError)
      expect((error as ImageError).statusCode).toBe(508)
      expect((error as ImageError).message).toBe(
        '"url" parameter is valid but upstream response is invalid'
      )
    })

    it('should not download the body of a redirect response', async () => {
      // `maximumResponseBody` is only enforced on the final response, so
      // draining a redirect body would let the upstream send unlimited bytes
      const redirectBodySize = 64 * 1024 * 1024
      const chunk = Buffer.alloc(1024 * 1024)
      let bytesSent = 0
      let bodyFullyWritten = false
      let redirectClosed: Promise<void> | undefined

      handler = (req, res) => {
        if (req.url !== '/redirect-body.jpg') {
          res.writeHead(200, { 'content-type': 'image/jpeg' })
          return res.end(Buffer.from([4, 5, 6]))
        }
        res.writeHead(302, { location: '/final.jpg' })
        redirectClosed = new Promise((resolve) => res.on('close', resolve))
        const write = () => {
          if (res.destroyed || res.writableEnded) return
          if (bytesSent >= redirectBodySize) {
            bodyFullyWritten = true
            return res.end()
          }
          bytesSent += chunk.byteLength
          if (res.write(chunk)) setImmediate(write)
          else res.once('drain', write)
        }
        write()
      }

      const result = await fetchExternalImage(
        `${origin()}/redirect-body.jpg`,
        true,
        MAXIMUM_RESPONSE_BODY
      )
      await redirectClosed

      expect(result.buffer).toEqual(Buffer.from([4, 5, 6]))
      expect(requests).toEqual(['/redirect-body.jpg', '/final.jpg'])
      // Discarding the body stops at whatever the socket already buffered,
      // whereas draining it would transfer every byte the upstream offered
      expect(bodyFullyWritten).toBe(false)
      expect(bytesSent).toBeLessThan(redirectBodySize / 2)
    })
  })

  describe('upstream timeout', () => {
    // The 7s upstream timeout is not configurable, so both phases are covered
    // by one test to avoid waiting for it twice
    it('should map a timeout to a 504 before the headers and during the body', async () => {
      handler = (req, res) => {
        if (req.url === '/stalled-body.jpg') {
          // Headers arrive, then the body stalls until the timeout fires
          res.writeHead(200, { 'content-type': 'image/jpeg' })
          res.write(Buffer.from([0xff, 0xd8]))
        }
        // `/stalled-headers.jpg` is never answered at all
      }

      const summarize = (error: unknown) =>
        error instanceof ImageError
          ? { statusCode: error.statusCode, message: error.message }
          : { statusCode: 'not an ImageError', message: String(error) }

      const [beforeHeaders, duringBody] = await Promise.all([
        fetchExternalImage(
          `${origin()}/stalled-headers.jpg`,
          true,
          MAXIMUM_RESPONSE_BODY
        ).catch((e) => e),
        fetchExternalImage(
          `${origin()}/stalled-body.jpg`,
          true,
          MAXIMUM_RESPONSE_BODY
        ).catch((e) => e),
      ])

      const timedOut = {
        statusCode: 504,
        message: '"url" parameter is valid but upstream response timed out',
      }
      expect({
        beforeHeaders: summarize(beforeHeaders),
        duringBody: summarize(duringBody),
      }).toEqual({ beforeHeaders: timedOut, duringBody: timedOut })
    }, 20_000)
  })

  describe('response size limit', () => {
    it('should throw error when exceeding maximumResponseBody config on later chunk', async () => {
      const maximumResponseBody = 2_000 // 2KB custom limit
      const chunkSize = 1_000 // 1KB chunks
      const numChunks = 3 // 3KB total, exceeds custom 2KB limit

      handler = (_req, res) => {
        res.writeHead(200, { 'content-type': 'image/jpeg' })
        for (let i = 0; i < numChunks; i++) {
          res.write(Buffer.alloc(chunkSize))
        }
        res.end()
      }

      const error = await fetchExternalImage(
        `${origin()}/custom-limit.jpg`,
        true,
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

      handler = (_req, res) => {
        res.writeHead(200, { 'content-type': 'image/jpeg' })
        res.end(Buffer.alloc(maximumResponseBody + 1))
      }

      const error = await fetchExternalImage(
        `${origin()}/custom-limit.jpg`,
        true,
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

      handler = (_req, res) => {
        res.writeHead(200, { 'content-type': 'image/jpeg' })
        res.end(Buffer.alloc(maximumResponseBody))
      }

      const result = await fetchExternalImage(
        `${origin()}/custom-limit.jpg`,
        true,
        maximumResponseBody
      )

      expect(result.buffer).toBeInstanceOf(Buffer)
      expect(result.buffer.length).toBe(maximumResponseBody)
    })

    it('should succeed when exactly matching maximumResponseBody config on later chunk', async () => {
      const maximumResponseBody = 3_000 // 3KB custom limit
      const chunkSize = 1_000 // 1KB chunks
      const numChunks = 3 // 3KB total

      handler = (_req, res) => {
        res.writeHead(200, {
          'content-type': 'image/jpeg',
          'content-length': String(maximumResponseBody),
        })
        for (let i = 0; i < numChunks; i++) {
          res.write(Buffer.alloc(chunkSize))
        }
        res.end()
      }

      const result = await fetchExternalImage(
        `${origin()}/custom-limit.jpg`,
        true,
        maximumResponseBody
      )

      expect(result.buffer).toBeInstanceOf(Buffer)
      expect(result.buffer.length).toBe(maximumResponseBody)
    })
  })
})
