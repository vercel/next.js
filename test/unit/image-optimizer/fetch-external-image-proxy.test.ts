/* eslint-env jest */
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'http'
import type { AddressInfo } from 'net'

type ImageOptimizer = typeof import('next/dist/server/image-optimizer')

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
const actualLookup =
  jest.requireActual<typeof import('dns/promises')>('dns/promises').lookup
const actualIsPrivateIp = jest.requireActual<
  typeof import('next/dist/server/is-private-ip')
>('next/dist/server/is-private-ip').isPrivateIp

const MAXIMUM_RESPONSE_BODY = 50_000_000
const PROXY_ENV_KEYS = [
  'NODE_USE_ENV_PROXY',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'no_proxy',
]

let server: Server
let requests: string[]
let originalEnv: Record<string, string | undefined>
let fetchExternalImage: ImageOptimizer['fetchExternalImage']
let ImageError: ImageOptimizer['ImageError']

function port() {
  return (server.address() as AddressInfo).port
}

beforeAll(async () => {
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    requests.push(req.url ?? '')
    res.writeHead(200, { 'content-type': 'image/jpeg' })
    res.end(Buffer.from([0xff, 0xd8, 0xff]))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))

  originalEnv = Object.fromEntries(
    PROXY_ENV_KEYS.map((key) => [key, process.env[key]])
  )
  for (const key of PROXY_ENV_KEYS) {
    delete process.env[key]
  }
  process.env.NODE_USE_ENV_PROXY = '1'
  process.env.HTTP_PROXY = `http://127.0.0.1:${port()}`
  process.env.NO_PROXY = 'direct.invalid'
  ;({ fetchExternalImage, ImageError } =
    require('next/dist/server/image-optimizer') as ImageOptimizer)
})

afterAll(async () => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

beforeEach(() => {
  requests = []
})

afterEach(() => {
  jest.mocked(lookupMock).mockReset().mockImplementation(actualLookup)
  jest.mocked(isPrivateIpMock).mockReset().mockImplementation(actualIsPrivateIp)
})

describe('fetchExternalImage with a proxy', () => {
  it('should send the request through HTTP_PROXY', async () => {
    jest
      .mocked(lookupMock)
      .mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }] as any)
    jest.mocked(isPrivateIpMock).mockReturnValueOnce(false)

    const result = await fetchExternalImage(
      'http://proxied.invalid/proxied.jpg',
      false,
      MAXIMUM_RESPONSE_BODY
    )

    expect(result.buffer).toEqual(Buffer.from([0xff, 0xd8, 0xff]))
    expect(requests).toEqual(['http://proxied.invalid/proxied.jpg'])
  })

  it('should still reject a hostname that resolves to a private IP', async () => {
    jest
      .mocked(lookupMock)
      .mockResolvedValueOnce([{ address: '10.0.0.1', family: 4 }] as any)

    const error = await fetchExternalImage(
      'http://internal.invalid/private.jpg',
      false,
      MAXIMUM_RESPONSE_BODY
    ).catch((e) => e)

    expect(error).toBeInstanceOf(ImageError)
    expect(error).toMatchObject({ statusCode: 400 })
    expect(requests).toHaveLength(0)
  })

  it('should connect directly to hosts listed in NO_PROXY', async () => {
    jest
      .mocked(lookupMock)
      .mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }] as any)
    jest.mocked(isPrivateIpMock).mockReturnValueOnce(false)

    const result = await fetchExternalImage(
      `http://direct.invalid:${port()}/direct.jpg`,
      false,
      MAXIMUM_RESPONSE_BODY
    )

    expect(result.buffer).toEqual(Buffer.from([0xff, 0xd8, 0xff]))
    expect(requests).toEqual(['/direct.jpg'])
  })
})
