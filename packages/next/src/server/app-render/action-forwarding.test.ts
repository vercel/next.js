import type { IncomingHttpHeaders } from 'http'
import type { BaseNextRequest } from '../base-http'
import { NEXT_REQUEST_META } from '../request-meta'
import {
  getActionForwardingOrigin,
  getForwardedHostValue,
  restoreForwardedActionHost,
} from './action-forwarding'

const ACTION_ID = '00' + 'a'.repeat(40)
const PRIVATE_ORIGIN = 'http://localhost:3000'
const INTERNAL_HOST = 'localhost:3000'
const PUBLIC_HOST = 'tenant.example'

function createRequest({
  headers,
  method = 'POST',
  initURL,
}: {
  headers?: IncomingHttpHeaders
  method?: string
  initURL?: string
}): BaseNextRequest {
  return {
    method,
    headers: {
      'next-action': ACTION_ID,
      'content-type': 'text/plain;charset=UTF-8',
      ...headers,
    },
    [NEXT_REQUEST_META]: { initURL },
  } as unknown as BaseNextRequest
}

// The shape `createForwardedActionResponse` produces: it arrives at the origin
// we forwarded to, and only `x-forwarded-host` still knows the original host.
function createForwardedRequest(
  headers?: IncomingHttpHeaders,
  initURL?: string
): BaseNextRequest {
  return createRequest({
    headers: {
      host: INTERNAL_HOST,
      'x-forwarded-host': PUBLIC_HOST,
      'x-action-forwarded': '1',
      ...headers,
    },
    initURL,
  })
}

describe('getForwardedHostValue', () => {
  it('reads a single value', () => {
    expect(getForwardedHostValue({ 'x-forwarded-host': PUBLIC_HOST })).toBe(
      PUBLIC_HOST
    )
  })

  it('reads the first value of a comma-separated list', () => {
    expect(
      getForwardedHostValue({
        'x-forwarded-host': `${PUBLIC_HOST}, proxy.example`,
      })
    ).toBe(PUBLIC_HOST)
  })

  it('reads the first value of a repeated header', () => {
    expect(
      getForwardedHostValue({
        'x-forwarded-host': [PUBLIC_HOST, 'proxy.example'],
      })
    ).toBe(PUBLIC_HOST)
  })

  it('returns undefined when the header is missing or empty', () => {
    expect(getForwardedHostValue({})).toBeUndefined()
    expect(getForwardedHostValue({ 'x-forwarded-host': [] })).toBeUndefined()
  })
})

describe('getActionForwardingOrigin', () => {
  const originalPrivateOrigin = process.env.__NEXT_PRIVATE_ORIGIN

  afterEach(() => {
    process.env.__NEXT_PRIVATE_ORIGIN = originalPrivateOrigin
  })

  it('prefers the private origin', () => {
    process.env.__NEXT_PRIVATE_ORIGIN = PRIVATE_ORIGIN

    expect(
      getActionForwardingOrigin(
        createRequest({ initURL: 'http://127.0.0.1:4000/some/path' })
      )
    ).toBe(PRIVATE_ORIGIN)
  })

  it('falls back to the origin of initURL', () => {
    delete process.env.__NEXT_PRIVATE_ORIGIN

    expect(
      getActionForwardingOrigin(
        createRequest({ initURL: 'http://localhost:3000/some/path?a=b' })
      )
    ).toBe(PRIVATE_ORIGIN)
  })

  it('throws when initURL is missing', () => {
    delete process.env.__NEXT_PRIVATE_ORIGIN

    expect(() => getActionForwardingOrigin(createRequest({}))).toThrow(
      'Missing initURL'
    )
  })

  it('throws when initURL is not absolute', () => {
    delete process.env.__NEXT_PRIVATE_ORIGIN

    // What `attachRequestMeta` produces when the server has no configured
    // hostname and port and does not trust the host header.
    expect(() =>
      getActionForwardingOrigin(createRequest({ initURL: '/some/path' }))
    ).toThrow('Could not determine origin')
  })
})

describe('restoreForwardedActionHost', () => {
  const originalPrivateOrigin = process.env.__NEXT_PRIVATE_ORIGIN

  beforeEach(() => {
    process.env.__NEXT_PRIVATE_ORIGIN = PRIVATE_ORIGIN
  })

  afterEach(() => {
    process.env.__NEXT_PRIVATE_ORIGIN = originalPrivateOrigin
  })

  function restore(req: BaseNextRequest, hasConfiguredOrigin = true) {
    restoreForwardedActionHost(req, { hasConfiguredOrigin })
    return req.headers['host']
  }

  it('restores the original host on a forwarded action', () => {
    expect(restore(createForwardedRequest())).toBe(PUBLIC_HOST)
  })

  it('restores the first value of an x-forwarded-host list', () => {
    expect(
      restore(
        createForwardedRequest({
          'x-forwarded-host': `${PUBLIC_HOST}, proxy.example`,
        })
      )
    ).toBe(PUBLIC_HOST)

    expect(
      restore(
        createForwardedRequest({
          'x-forwarded-host': [PUBLIC_HOST, 'proxy.example'],
        })
      )
    ).toBe(PUBLIC_HOST)
  })

  it('restores a host that carries an explicit port', () => {
    expect(
      restore(
        createForwardedRequest({ 'x-forwarded-host': `${PUBLIC_HOST}:8443` })
      )
    ).toBe(`${PUBLIC_HOST}:8443`)
  })

  it('compares the internal origin with its port', () => {
    // Same hostname, different port: this request did not arrive at the origin
    // we forward to.
    expect(restore(createForwardedRequest({ host: 'localhost:3001' }))).toBe(
      'localhost:3001'
    )
  })

  it('ignores a request that did not arrive at the internal origin', () => {
    // A client that forges the marker but reaches the server on its public
    // host must not be able to rewrite `host` from a header it also controls.
    expect(restore(createForwardedRequest({ host: 'attacker.example' }))).toBe(
      'attacker.example'
    )
  })

  it.each([undefined, '', 'true', '0', '1, 1', 'yes'])(
    'ignores the marker value %p',
    (markerValue) => {
      expect(
        restore(createForwardedRequest({ 'x-action-forwarded': markerValue }))
      ).toBe(INTERNAL_HOST)
    }
  )

  it('ignores a request that is not a fetch action', () => {
    // Only a POST carrying an action id is ever forwarded.
    expect(
      restore(
        createRequest({
          method: 'GET',
          headers: {
            host: INTERNAL_HOST,
            'x-forwarded-host': PUBLIC_HOST,
            'x-action-forwarded': '1',
          },
        })
      )
    ).toBe(INTERNAL_HOST)

    expect(
      restore(
        createForwardedRequest({
          // A multipart (MPA) action is never forwarded either.
          'next-action': undefined,
          'content-type': 'multipart/form-data; boundary=----x',
        })
      )
    ).toBe(INTERNAL_HOST)
  })

  it('ignores a request without x-forwarded-host', () => {
    expect(
      restore(createForwardedRequest({ 'x-forwarded-host': undefined }))
    ).toBe(INTERNAL_HOST)
  })

  it('ignores a malformed private origin', () => {
    process.env.__NEXT_PRIVATE_ORIGIN = 'not a url'

    expect(restore(createForwardedRequest())).toBe(INTERNAL_HOST)
  })

  describe('without a private origin', () => {
    beforeEach(() => {
      delete process.env.__NEXT_PRIVATE_ORIGIN
    })

    it('compares against the origin of initURL', () => {
      expect(
        restore(
          createForwardedRequest({}, 'http://localhost:3000/without-action')
        )
      ).toBe(PUBLIC_HOST)
    })

    it('ignores initURL when the server has no configured origin', () => {
      // `initURL` is then built from this request's own host header, so it
      // proves nothing about where the request arrived.
      expect(
        restore(
          createForwardedRequest({}, `http://${INTERNAL_HOST}/without-action`),
          false
        )
      ).toBe(INTERNAL_HOST)
    })

    it('ignores a request when no origin can be determined', () => {
      expect(restore(createForwardedRequest())).toBe(INTERNAL_HOST)
      expect(restore(createForwardedRequest({}, '/without-action'))).toBe(
        INTERNAL_HOST
      )
    })
  })
})
