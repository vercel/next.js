import { nextTestSetup } from 'e2e-utils'
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// Image reference: remotePatterns matches protocol, hostname, port, pathname
// and search. The controlled remote origin is a loopback listener in this test
// process, so a deployed application cannot reach it. Other image contracts
// remain in the deployment-capable route-selection fixture.
// @force-gate !deploy
describe('documented remote image source admission', () => {
  const { next } = nextTestSetup({ files: __dirname, skipStart: true })
  const servers: Server[] = []
  const origins: string[] = []
  const visits: string[] = []

  beforeAll(async () => {
    const image = await readFile(join(__dirname, 'source.jpg'))
    for (let index = 0; index < 2; index++) {
      const server = createServer((request, response) => {
        visits.push(index + ':' + request.url)
        response.writeHead(200, { 'content-type': 'image/jpeg' })
        response.end(image)
      })
      servers.push(server)
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', resolve)
      })
      origins.push('http://127.0.0.1:' + (server.address() as AddressInfo).port)
    }

    const rules = [
      {
        protocol: 'http',
        hostname: '127.0.0.1',
        port: new URL(origins[0]).port,
        pathname: '/account/**',
        search: '?v=123',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
        port: new URL(origins[0]).port,
        pathname: '/single/*',
        search: '',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
        // Omitting port permits both independently allocated origin ports.
        pathname: '/any-port/**',
        search: '',
      },
    ]
    await next.patchFile(
      'next.config.ts',
      `export default {
        cacheComponents: false,
        images: {
          qualities: [75],
          dangerouslyAllowLocalIP: true,
          remotePatterns: [
            ...${JSON.stringify(rules)},
            new URL('${origins[0]}/url-pattern/**')
          ],
        },
      }`
    )
    await next.start()
  })

  afterAll(async () => {
    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve, reject) => {
            if (!server.listening) {
              resolve()
              return
            }
            server.close((error) => (error ? reject(error) : resolve()))
            server.closeAllConnections()
          })
      )
    )
  })

  async function optimize(source: string) {
    return next.fetch(
      '/_next/image?' + new URLSearchParams({ url: source, w: '640', q: '75' }),
      { signal: AbortSignal.timeout(15000) }
    )
  }

  for (const path of [
    '/account/photo.jpg?v=123',
    '/account/team/photo.jpg?v=123',
    '/single/photo.jpg',
    '/url-pattern/photo.jpg',
  ]) {
    it('[R32] optimizes an allowed remote source ' + path, async () => {
      const before = visits.length
      const response = await optimize(origins[0] + path)
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toMatch(/^image\//)
      expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0)
      expect(visits.slice(before)).toContain('0:' + path)
    })
  }

  it('[R32] permits different remote ports when port is omitted', async () => {
    for (const [index, origin] of origins.entries()) {
      const path = '/any-port/port-' + index + '.jpg'
      const before = visits.length
      const response = await optimize(origin + path)
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toMatch(/^image\//)
      expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0)
      expect(visits.slice(before)).toContain(index + ':' + path)
    }
  })

  for (const mismatch of [
    'protocol',
    'hostname',
    'port',
    'pathname',
    'pathname-prefix',
    'single-segment',
    'query',
    'missing-query',
    'extra-query',
    'url-object-query',
  ]) {
    it(
      '[R32] rejects a remote ' + mismatch + ' mismatch before fetching it',
      async () => {
        const source = new URL('/account/photo.jpg?v=123', origins[0])
        switch (mismatch) {
          case 'protocol':
            source.protocol = 'https:'
            break
          case 'hostname':
            source.hostname = 'localhost'
            break
          case 'port':
            source.port = new URL(origins[1]).port
            break
          case 'pathname':
            source.pathname = '/other/photo.jpg'
            break
          case 'pathname-prefix':
            source.pathname = '/accounting/photo.jpg'
            break
          case 'single-segment':
            source.pathname = '/single/team/photo.jpg'
            source.search = ''
            break
          case 'query':
            source.search = '?v=124'
            break
          case 'missing-query':
            source.search = ''
            break
          case 'extra-query':
            source.search = '?v=123&extra=1'
            break
          case 'url-object-query':
            source.pathname = '/url-pattern/photo.jpg'
            break
          default:
            throw new Error('Unknown remote-pattern mismatch: ' + mismatch)
        }
        const before = visits.length
        const response = await optimize(source.href)
        expect(response.status).toBe(400)
        await response.text()
        expect(visits).toHaveLength(before)
      }
    )
  }
})
