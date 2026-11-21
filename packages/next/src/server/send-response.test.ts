import { sendResponse } from './send-response'
import { NodeNextResponse } from './base-http/node'
import http from 'http'
import zlib from 'node:zlib'
import type { AddressInfo } from 'net'

// sendResponse pipes the body through pipeToNodeResponse, which waits for the
// underlying ServerResponse to emit `finish`. That only happens on a real
// server-managed response, so each test serves the response over loopback
// http. The header is asserted on the server side: a plain http client does
// not surface a forwarded `content-length` reliably.
async function captureResponseHeader(
  buildResponse: () => Response,
  method: string = 'GET'
): Promise<string | number | string[] | undefined> {
  let contentLength: string | number | string[] | undefined

  const server = http.createServer(async (req, res) => {
    const nodeRes = new NodeNextResponse(res)
    await sendResponse(req as never, nodeRes, buildResponse(), undefined)
    contentLength = res.getHeader('content-length')
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  try {
    const raw = await new Promise<http.IncomingMessage>((resolve, reject) => {
      const req = http.request(
        { port, host: '127.0.0.1', path: '/', method },
        resolve
      )
      req.on('error', reject)
      req.end()
    })
    raw.resume()
    await new Promise<void>((resolve) => raw.once('end', resolve))
    return contentLength
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

describe('sendResponse Content-Length', () => {
  it('preserves a correct Content-Length on a fixed body', async () => {
    const body = 'hello length'
    const contentLength = await captureResponseHeader(
      () =>
        new Response(body, {
          headers: {
            'content-type': 'text/plain',
            'content-length': String(Buffer.byteLength(body)),
          },
        })
    )

    expect(contentLength).toBe(String(Buffer.byteLength(body)))
  })

  it('preserves a correct Content-Length on a stream body', async () => {
    const chunks = ['hello ', 'stream']
    const total = chunks.reduce(
      (sum, chunk) => sum + Buffer.byteLength(chunk),
      0
    )

    const contentLength = await captureResponseHeader(() => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(new TextEncoder().encode(chunk))
          }
          controller.close()
        },
      })
      return new Response(stream, {
        headers: {
          'content-type': 'text/plain',
          'content-length': String(total),
        },
      })
    })

    expect(contentLength).toBe(String(total))
  })

  it('drops a Content-Length that does not match the body', async () => {
    const contentLength = await captureResponseHeader(
      () =>
        new Response('short', {
          headers: {
            'content-type': 'text/plain',
            // The body is 5 bytes, the header claims 999.
            'content-length': '999',
          },
        })
    )

    expect(contentLength).toBeUndefined()
  })

  it('drops a stale Content-Length from a decoded fetch body', async () => {
    // Simulates GHSA-pc58-hwjq-p385: fetch transparently decompressed a
    // gzip body but kept the original headers, so the declared length is
    // the compressed size while the body is the decoded bytes.
    const decoded = Buffer.from('hello decoded world')
    const compressed = zlib.gzipSync(decoded)

    const contentLength = await captureResponseHeader(
      () =>
        new Response(decoded, {
          headers: {
            'content-type': 'text/plain',
            'content-encoding': 'gzip',
            'content-length': String(compressed.byteLength),
          },
        })
    )

    expect(contentLength).toBeUndefined()
  })

  it('drops a correct Content-Length above the verification cap', async () => {
    // Bodies above the cap keep the previous behaviour (header dropped,
    // chunked framing) instead of buffering the whole body for verification.
    const body = 'x'.repeat(10 * 1024 * 1024 + 1)

    const contentLength = await captureResponseHeader(
      () =>
        new Response(body, {
          headers: {
            'content-type': 'text/plain',
            'content-length': String(Buffer.byteLength(body)),
          },
        })
    )

    expect(contentLength).toBeUndefined()
  })

  it('preserves Content-Length for a HEAD request', async () => {
    const body = 'head body'
    const contentLength = await captureResponseHeader(
      () =>
        new Response(body, {
          headers: {
            'content-type': 'text/plain',
            'content-length': String(Buffer.byteLength(body)),
          },
        }),
      'HEAD'
    )

    expect(contentLength).toBe(String(Buffer.byteLength(body)))
  })
})
