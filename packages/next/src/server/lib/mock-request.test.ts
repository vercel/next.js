import { Socket } from 'net'

import {
  MockedRequest,
  MockedResponse,
  createRequestResponseMocks,
} from './mock-request'

describe('MockedRequest', () => {
  it('should have the correct properties', () => {
    const req = new MockedRequest({
      url: '/hello',
      method: 'POST',
      headers: {
        'x-foo': 'bar',
      },
    })

    expect(req.url).toBe('/hello')
    expect(req.method).toBe('POST')
    expect(req.headers).toEqual({
      'x-foo': 'bar',
    })
  })
})

describe('MockedResponse', () => {
  it('should merge headers correctly when calling writeHead', () => {
    const res = new MockedResponse({})

    res.setHeader('x-foo', 'bar')
    res.setHeader('x-bar', 'foo')

    res.writeHead(200, { 'x-foo': 'bar, foo', 'x-bar': 'foo, bar' })
    expect(res.getHeaders()).toEqual({
      'x-foo': 'bar, foo',
      'x-bar': 'foo, bar',
    })

    res.writeHead(200, ['x-foo', 'foo, bar', 'x-bar', 'bar, foo'])
    expect(res.getHeaders()).toEqual({
      'x-foo': 'foo, bar',
      'x-bar': 'bar, foo',
    })

    res.writeHead(200, ['x-foo', ['bar', 'foo'], 'x-bar', ['foo', 'bar']])
    expect(res.getHeaders()).toEqual({
      'x-foo': 'bar, foo',
      'x-bar': 'foo, bar',
    })

    res.writeHead(200, ['x-foo', 1, 'x-bar', 2])
    expect(res.getHeaders()).toEqual({
      'x-foo': '1',
      'x-bar': '2',
    })
  })

  it('should update the statusMessage after calling writeHead', () => {
    const res = new MockedResponse({})

    // Default code and status message is 200 and ''.
    expect(res.statusCode).toBe(200)
    expect(res.statusMessage).toBe('')

    res.writeHead(200, 'OK')
    expect(res.statusCode).toBe(200)
    expect(res.statusMessage).toBe('OK')

    res.writeHead(400, 'Bad Request')
    expect(res.statusCode).toBe(400)
    expect(res.statusMessage).toBe('Bad Request')
  })

  it('should handle set-cookie headers correctly', () => {
    const res = new MockedResponse({})

    res.setHeader('set-cookie', ['foo=bar', 'bar=foo'])
    expect(res.getHeaders()).toEqual({
      'set-cookie': ['foo=bar', 'bar=foo'],
    })

    res.writeHead(200, { 'Set-Cookie': 'foo=bar2' })
    expect(res.getHeaders()).toEqual({
      'set-cookie': 'foo=bar2',
    })

    res.writeHead(200, { 'Set-Cookie': ['foo=bar2', 'bar2=foo'] })
    expect(res.getHeaders()).toEqual({
      'set-cookie': ['foo=bar2', 'bar2=foo'],
    })
  })
})

describe('createRequestResponseMocks', () => {
  it('should only attach the socket to the request, not the response', () => {
    const socket = new Socket()
    const { req, res } = createRequestResponseMocks({
      url: '/_next/image?url=%2Ffoo.png',
      socket,
    })

    // The request needs the socket so the router can read properties like
    // `socket.encrypted` and `socket.remoteAddress` from it.
    expect(req.socket).toBe(socket)

    // The mocked response is a buffer rather than a wire, so it must not be
    // tied to the client's socket. `on-finished` (used by the vendored `send`)
    // treats a response with a non-writable socket as already finished, so a
    // client disconnecting mid-request would otherwise prevent the internal
    // response from ever completing and poison the response cache key.
    expect(res.socket).toBe(null)
  })
})
