import { addRequestMeta } from '../request-meta'
import { patchSetHeaderWithCookieSupport } from './patch-set-header'

function createResponse() {
  const headers = new Map<string, string | string[]>()

  return {
    headers,
    res: {
      setHeader(key: string, value: string | string[]) {
        headers.set(key, value)
        return this
      },
    },
  }
}

describe('patchSetHeaderWithCookieSupport', () => {
  it('does not dedupe set-cookie values when middleware did not set cookies', () => {
    const req = {}
    const { headers, res } = createResponse()

    patchSetHeaderWithCookieSupport(req as any, res)

    res.setHeader('Set-Cookie', [
      'session=from-action-1; Path=/',
      'session=from-action-2; Path=/',
    ])

    expect(headers.get('Set-Cookie')).toEqual([
      'session=from-action-1; Path=/',
      'session=from-action-2; Path=/',
    ])
  })

  it('lets later set-cookie values replace matching middleware cookies', () => {
    const req = {}
    const { headers, res } = createResponse()

    addRequestMeta(req as any, 'middlewareCookie', [
      'middleware-repro=from-middleware; Path=/',
      'middleware-only=from-middleware; Path=/',
    ])
    patchSetHeaderWithCookieSupport(req as any, res)

    res.setHeader('Set-Cookie', [
      'middleware-repro=from-action; Path=/',
      'action-repro=from-action-2; Path=/',
    ])

    expect(headers.get('Set-Cookie')).toEqual([
      'middleware-repro=from-action; Path=/',
      'middleware-only=from-middleware; Path=/',
      'action-repro=from-action-2; Path=/',
    ])
  })

  it('keeps cookies with the same name but different path or domain', () => {
    const req = {}
    const { headers, res } = createResponse()

    addRequestMeta(req as any, 'middlewareCookie', [
      'session=from-middleware; Path=/admin',
      'session=from-middleware-domain; Path=/; Domain=example.com',
    ])
    patchSetHeaderWithCookieSupport(req as any, res)

    res.setHeader('Set-Cookie', 'session=from-action; Path=/')

    expect(headers.get('Set-Cookie')).toEqual([
      'session=from-middleware; Path=/admin',
      'session=from-middleware-domain; Path=/; Domain=example.com',
      'session=from-action; Path=/',
    ])
  })
})
