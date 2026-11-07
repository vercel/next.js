import { EventEmitter } from 'events'
import type { IncomingMessage, ServerResponse } from 'http'
import path from 'path'

const NextNodeServer = require('next/dist/server/next-server').default
const tracer = require('next/dist/server/lib/trace/tracer').getTracer()
const distDir = path.join(__dirname, 'fixtures', '.next')
const middlewarePath = path.join(distDir, 'server', 'middleware.js')

function createServer(prepare = async () => {}, config = {}, edge = false) {
  jest.doMock(
    path.join(distDir, 'server', 'functions-config-manifest.json'),
    () => ({ functions: { '/_middleware': {} } }),
    { virtual: true }
  )
  return Object.assign(Object.create(NextNodeServer.prototype), {
    dev: false,
    minimalMode: false,
    distDir,
    nextConfig: { experimental: {}, ...config },
    renderOpts: { previewProps: { previewModeId: 'test-preview-id' } },
    hostname: 'localhost',
    fetchHostname: 'localhost',
    port: 3000,
    prepare,
    getMiddlewareManifest: () => ({ middleware: edge ? { '/': {} } : {} }),
    getWaitUntil: () => undefined,
  })
}

function request() {
  return {
    method: 'GET',
    url: '/hello',
    headers: { host: 'example.test' },
    socket: { remoteAddress: '192.0.2.1' },
  } as IncomingMessage
}

function response() {
  const res = new EventEmitter() as ServerResponse
  res.end = jest.fn()
  res.setHeader = jest.fn()
  return res
}

beforeEach(() => jest.resetModules())
afterEach(() => jest.restoreAllMocks())

it('awaits preparation before importing an async proxy and reuses it', async () => {
  let ready!: () => void
  const server = createServer(
    () => new Promise<void>((resolve) => (ready = resolve))
  )
  const result = {
    response: new Response(null, {
      status: 204,
      headers: {
        'set-cookie':
          'first=1; Expires=Wed, 21 Oct 2030 07:28:00 GMT, second=2',
      },
    }),
    waitUntil: Promise.resolve(),
  }
  const adapter = jest.fn(
    async (_options: { request: { headers: IncomingMessage['headers'] } }) =>
      result
  )
  const load = jest.fn(() => Promise.resolve({ default: adapter }))
  jest.doMock(middlewarePath, load, { virtual: true })
  const pending = server.getProxyFastPathHandler()
  expect(load).not.toHaveBeenCalled()
  ready()
  const handle = await pending
  for (let i = 0; i < 2; i++) {
    const req = request()
    const res = response()
    const setHeader = res.setHeader
    await expect(
      handle(req, res, { pathname: '/hello', query: {} })
    ).resolves.toBe(result)
    res.setHeader('set-cookie', ['downstream=3'])
    expect(setHeader).toHaveBeenLastCalledWith('set-cookie', [
      'first=1; Expires=Wed, 21 Oct 2030 07:28:00 GMT',
      'second=2',
      'downstream=3',
    ])
  }
  expect(load).toHaveBeenCalledTimes(1)
  expect(adapter).toHaveBeenCalledTimes(2)
  expect(result.response.headers.getSetCookie()).toEqual([
    'first=1; Expires=Wed, 21 Oct 2030 07:28:00 GMT',
    'second=2',
  ])
  expect(adapter.mock.calls[0][0].request.headers).toMatchObject({
    'x-forwarded-host': 'example.test',
    'x-forwarded-port': '3000',
    'x-forwarded-proto': 'http',
    'x-forwarded-for': '192.0.2.1',
  })
})

it('keeps normal handling when preparation enables OpenTelemetry', async () => {
  const enabled = jest
    .spyOn(tracer, 'isOpenTelemetryEnabled')
    .mockReturnValue(false)
  const server = createServer(async () => {
    enabled.mockReturnValue(true)
  })
  const load = jest.fn(() => {
    throw new Error('proxy must not load')
  })
  jest.doMock(middlewarePath, load, { virtual: true })
  expect(await server.getProxyFastPathHandler()).toBeNull()
  expect(load).not.toHaveBeenCalled()
})

it.each<[string, object, boolean]>([
  ['i18n', { i18n: {} }, false],
  ['base path', { basePath: '/base' }, false],
  ['trailing slash', { trailingSlash: true }, false],
  ['URL normalization', { skipProxyUrlNormalize: true }, false],
  ['Edge middleware', {}, true],
])('keeps normal handling for %s', async (_, config, edge) => {
  const server = createServer(undefined, config, edge)
  const load = jest.fn(() => {
    throw new Error('proxy must not load')
  })
  jest.doMock(middlewarePath, load, { virtual: true })
  expect(await server.getProxyFastPathHandler()).toBeNull()
  expect(load).not.toHaveBeenCalled()
})

it.each(['has', 'missing'])(
  'keeps conditional %s matchers on normal handling',
  async (condition) => {
    const server = createServer()
    jest.doMock(
      middlewarePath,
      () => ({
        config: {
          matchers: [{ [condition]: [{ type: 'header', key: 'x-test' }] }],
        },
      }),
      { virtual: true }
    )
    expect(await server.getProxyFastPathHandler()).toBeNull()
  }
)
