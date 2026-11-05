import http from 'http'
import net from 'net'
import zlib from 'zlib'
import { findPort } from 'next-test-utils'
import { nextTestSetup } from 'e2e-utils'

const SMUGGLED_RESPONSE = 'HTTP/1.1 200 OK\r\ncontent-length: 8\r\n\r\ninjected'

// Builds a decoded payload whose prefix is exactly as long as its gzip
// encoding, so a parser honoring the compressed Content-Length treats the
// remaining decoded bytes as the start of another response.
function buildPayload() {
  let prefix = ''
  for (let i = 0; i < 10; i++) {
    const compressedLength = zlib.gzipSync(prefix + SMUGGLED_RESPONSE).length
    if (compressedLength === prefix.length) break
    prefix = 'A'.repeat(compressedLength)
  }
  const decoded = Buffer.from(prefix + SMUGGLED_RESPONSE)
  return { decoded, compressed: zlib.gzipSync(decoded) }
}

interface RawResponse {
  statusLine: string
  headers: Record<string, string>
  body: Buffer
}

// Returns the de-chunked body once a complete chunked message is buffered,
// or null while bytes are still missing.
function tryDechunk(raw: Buffer): Buffer | null {
  const chunks: Buffer[] = []
  let offset = 0
  while (true) {
    const lineEnd = raw.indexOf('\r\n', offset)
    if (lineEnd === -1) return null
    const size = parseInt(raw.subarray(offset, lineEnd).toString(), 16)
    if (Number.isNaN(size)) return null
    offset = lineEnd + 2
    if (size === 0) {
      if (raw.length < offset + 2) return null
      return Buffer.concat(chunks)
    }
    if (raw.length < offset + size + 2) return null
    chunks.push(raw.subarray(offset, offset + size))
    offset += size + 2
  }
}

// A response is complete once its body is fully buffered: either a
// terminated chunked stream, or raw bytes of the expected length.
function isCompleteResponse(raw: Buffer, expectedBodyLength: number): boolean {
  const headEnd = raw.indexOf('\r\n\r\n')
  if (headEnd === -1) return false
  const head = raw.subarray(0, headEnd).toString().toLowerCase()
  const body = raw.subarray(headEnd + 4)
  return head.includes('transfer-encoding: chunked')
    ? tryDechunk(body) !== null
    : body.length >= expectedBodyLength
}

function parseRawResponse(raw: Buffer): RawResponse {
  const headEnd = raw.indexOf('\r\n\r\n')
  const headLines = raw.subarray(0, headEnd).toString().split('\r\n')
  const headers: Record<string, string> = {}
  for (const line of headLines.slice(1)) {
    const colon = line.indexOf(':')
    headers[line.slice(0, colon).toLowerCase()] = line.slice(colon + 1).trim()
  }
  let body = raw.subarray(headEnd + 4)
  if (headers['transfer-encoding'] === 'chunked') {
    const dechunked = tryDechunk(body)
    if (dechunked === null) {
      throw new Error('received an incomplete chunked body')
    }
    body = dechunked
  }
  return { statusLine: headLines[0], headers, body }
}

// @force-gate !deploy
describe('stale-compressed-framing', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  const { decoded, compressed } = buildPayload()
  let upstream: http.Server
  let upstreamRequests = 0

  beforeAll(async () => {
    const upstreamPort = await findPort()
    upstream = http.createServer((req, res) => {
      if (req.url === '/identity') {
        res.setHeader('content-length', decoded.length)
        res.end(decoded)
        return
      }
      upstreamRequests++
      res.setHeader('content-encoding', 'gzip')
      res.setHeader('content-length', compressed.length)
      res.end(compressed)
    })
    await new Promise<void>((resolve, reject) => {
      upstream.once('error', reject)
      upstream.listen(upstreamPort, () => resolve())
    })
    await next.start({ env: { TEST_UPSTREAM_PORT: String(upstreamPort) } })
  })

  afterAll(() => upstream.close())

  function rawRequest(path: string, method = 'GET'): Promise<RawResponse> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      const finish = () => {
        socket.removeAllListeners()
        socket.destroy()
        resolve(parseRawResponse(Buffer.concat(chunks)))
      }
      const socket = net.connect(Number(next.appPort), '127.0.0.1', () => {
        socket.write(
          `${method} ${path} HTTP/1.1\r\n` +
            `Host: 127.0.0.1:${next.appPort}\r\n` +
            `Connection: close\r\n\r\n`
        )
      })
      socket.on('data', (chunk) => {
        chunks.push(chunk)
        // The forwarded upstream headers can keep the socket alive, so
        // resolve once the whole body arrived instead of waiting for the
        // connection to close.
        if (isCompleteResponse(Buffer.concat(chunks), decoded.length)) {
          finish()
        }
      })
      socket.on('error', reject)
      socket.on('close', finish)
      socket.setTimeout(30000, () =>
        reject(new Error(`timed out waiting for response to ${path}`))
      )
    })
  }

  function expectDecodedFraming(res: RawResponse) {
    expect(res.statusLine).toBe('HTTP/1.1 200 OK')
    expect(res.headers['content-encoding']).toBeUndefined()
    expect(res.headers['content-length']).toBeUndefined()
    expect(res.headers['transfer-encoding']).toBe('chunked')
    // The body must be exactly the decoded payload, so the smuggled marker
    // only exists inside body bytes and a proxy honoring the response
    // framing cannot parse it as another response.
    expect(res.body).toEqual(decoded)
  }

  it('strips stale compressed framing on a direct response', async () => {
    expectDecodedFraming(await rawRequest('/proxy'))
  })

  it('strips stale compressed framing on responses from the fetch cache', async () => {
    expectDecodedFraming(await rawRequest('/proxy-cached'))
    const requestsAfterMiss = upstreamRequests
    expectDecodedFraming(await rawRequest('/proxy-cached'))
    expect(upstreamRequests).toBe(requestsAfterMiss)
  })

  it('strips stale compressed framing when cookies were set', async () => {
    const res = await rawRequest('/proxy-cookies')
    expectDecodedFraming(res)
    expect(res.headers['set-cookie']).toContain('stale-compressed-framing=1')
  })

  it('strips stale compressed framing on static responses', async () => {
    const res = await rawRequest('/proxy-static')
    expect(res.headers['content-encoding']).toBeUndefined()
    expect(res.headers['content-length']).not.toBe(String(compressed.length))
    expect(res.body).toEqual(decoded)
  })

  it('keeps the length of a forwarded response that was not encoded', async () => {
    const res = await rawRequest('/proxy-identity')
    expect(res.headers['content-length']).toBe(String(decoded.length))
    expect(res.headers['transfer-encoding']).toBeUndefined()
    expect(res.body).toEqual(decoded)
  })

  it('keeps Content-Encoding on a body encoded by the handler', async () => {
    const res = await rawRequest('/encoded')
    expect(res.headers['content-encoding']).toBe('gzip')
    expect(zlib.gunzipSync(res.body).toString()).toBe('encoded by the handler')
  })

  it('keeps Content-Length set by the handler', async () => {
    const res = await rawRequest('/sized')
    expect(res.headers['content-length']).toBe('20')
    expect(res.headers['transfer-encoding']).toBeUndefined()
    expect(res.body.toString()).toBe('sized by the handler')
  })

  it('keeps Content-Length set by the handler on HEAD', async () => {
    const res = await rawRequest('/sized', 'HEAD')
    expect(res.statusLine).toBe('HTTP/1.1 200 OK')
    expect(res.headers['content-length']).toBe('20')
  })

  it('leaves Transfer-Encoding to Node.js', async () => {
    const res = await rawRequest('/transfer-encoding')
    expect(res.headers['transfer-encoding']).toBe('chunked')
    expect(res.body.toString()).toBe('framed by Node.js')
  })

  it('does not send more bytes than a stale Content-Length promises', async () => {
    const res = await rawRequest('/proxy-rewrapped')
    expect(res.headers['content-length']).toBe(String(compressed.length))
    expect(res.body.length).toBeLessThanOrEqual(compressed.length)
    expect(res.body.toString()).not.toContain(SMUGGLED_RESPONSE)
  })

  it('closes the connection when the body is shorter than Content-Length', async () => {
    const res = await rawRequest('/oversized')
    expect(res.headers['content-length']).toBe('100')
    expect(res.body.length).toBeLessThan(100)
  })
})
