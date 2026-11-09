import { sendResponse } from './send-response'
import { NodeNextResponse } from './base-http/node'
import http from 'http'
import type { AddressInfo } from 'net'

// sendResponse pipes the body through pipeToNodeResponse, which waits for the
// underlying ServerResponse to emit `finish`. That only happens on a real
// server-managed response, so each test serves the response over loopback
// http. The header is asserted on the server side: undici fetch
// transparently decompresses and drops `content-encoding` on the client.
async function captureResponseHeader(
  buildResponse: () => Response
): Promise<string | undefined> {
  let contentEncoding: string | number | undefined

  const server = http.createServer(async (req, res) => {
    const nodeRes = new NodeNextResponse(res)
    await sendResponse(req as never, nodeRes, buildResponse(), undefined)
    contentEncoding = res.getHeader('content-encoding')
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  try {
    // raw client: no transparent decompression, the response is drained only
    const raw = await new Promise<http.IncomingMessage>((resolve, reject) => {
      const req = http.get({ port, host: '127.0.0.1', path: '/' }, resolve)
      req.on('error', reject)
    })
    raw.resume()
    await new Promise<void>((resolve) => raw.once('end', resolve))
    return contentEncoding
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

describe('sendResponse', () => {
  it('preserves Content-Encoding from a manually built Response', async () => {
    const zlib = require('node:zlib')
    const body = zlib.gzipSync(Buffer.from('hello compression'))

    const contentEncoding = await captureResponseHeader(() =>
      new Response(new Uint8Array(body), {
        headers: {
          'content-type': 'text/plain',
          'content-encoding': 'gzip',
        },
      })
    )

    expect(contentEncoding).toBe('gzip')
  })

  it('preserves Content-Encoding on a stream body too', async () => {
    // content-encoding is never touched: it describes whatever bytes the
    // handler chose to send, stream or buffer alike
    const contentEncoding = await captureResponseHeader(() => {
      const response = new Response('stream body')
      response.headers.set('content-encoding', 'gzip')
      return response
    })

    expect(contentEncoding).toBe('gzip')
  })
})
