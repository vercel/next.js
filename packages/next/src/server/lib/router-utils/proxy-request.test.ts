import type { IncomingMessage } from 'http'
import { stripHopByHopRequestHeaders } from './proxy-request'

function fakeRequest(headers: Record<string, string>): IncomingMessage {
  return { headers } as IncomingMessage
}

describe('stripHopByHopRequestHeaders', () => {
  it('strips the RFC 9110 hop-by-hop set', () => {
    const req = fakeRequest({
      host: 'example',
      connection: 'keep-alive',
      'keep-alive': 'timeout=5',
      te: 'trailers',
      trailer: 'x-checksum',
      'proxy-authorization': 'Basic abc',
      'proxy-connection': 'keep-alive',
    })
    stripHopByHopRequestHeaders(req)
    expect(req.headers).toEqual({ host: 'example', connection: 'keep-alive' })
  })

  it('strips headers nominated by the Connection token list', () => {
    const req = fakeRequest({
      host: 'example',
      connection: 'x-internal-auth, keep-alive',
      'x-internal-auth': '1',
      'x-untouched': 'yes',
    })
    stripHopByHopRequestHeaders(req)
    // The nominated header must not reach the upstream; the Connection field
    // itself is left alone so Node's connection bookkeeping is undisturbed.
    expect(req.headers).toEqual({
      host: 'example',
      connection: 'x-internal-auth, keep-alive',
      'x-untouched': 'yes',
    })
  })

  it('keeps transfer-encoding so the streamed body is forwarded', () => {
    const req = fakeRequest({
      host: 'example',
      connection: 'Transfer-Encoding, keep-alive',
      'transfer-encoding': 'chunked',
    })
    stripHopByHopRequestHeaders(req)
    expect(req.headers).toEqual({
      host: 'example',
      connection: 'Transfer-Encoding, keep-alive',
      'transfer-encoding': 'chunked',
    })
  })

  it('tolerates an absent Connection header', () => {
    const req = fakeRequest({ host: 'example', 'keep-alive': 'timeout=5' })
    expect(() => stripHopByHopRequestHeaders(req)).not.toThrow()
    expect(req.headers).toEqual({ host: 'example' })
  })
})
