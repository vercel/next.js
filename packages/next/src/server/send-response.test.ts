import { sendResponse } from './send-response'
import { NodeNextResponse } from './base-http/node'
import { IncomingMessage, ServerResponse } from 'http'
import { Socket } from 'net'

function createMocks() {
  const req = new IncomingMessage(new Socket())
  const res = new ServerResponse(req)
  const nodeRes = new NodeNextResponse(res)
  return { req, res, nodeRes }
}

describe('sendResponse', () => {
  it('preserves Content-Encoding from a manually built Response', async () => {
    const { res, nodeRes } = createMocks()
    const zlib = require('node:zlib')
    const body = zlib.gzipSync(Buffer.from('hello compression'))
    const response = new Response(new Uint8Array(body), {
      headers: {
        'content-type': 'text/plain',
        'content-encoding': 'gzip',
      },
    })

    await sendResponse(
      {} as never,
      nodeRes,
      response,
      undefined
    )

    expect(res.getHeader('content-encoding')).toBe('gzip')
  })

  it('still strips Content-Encoding from a decoded fetch response', async () => {
    const { res, nodeRes } = createMocks()
    const response = new Response('decoded body')
    // a decoded fetch response carries the origin url and its pre-decode headers
    Object.defineProperty(response, 'url', { value: 'https://example.com/' })
    response.headers.set('content-encoding', 'gzip')

    await sendResponse({} as never, nodeRes, response, undefined)

    expect(res.getHeader('content-encoding')).toBeUndefined()
  })
})
