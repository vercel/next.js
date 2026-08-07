import http from 'node:http'

import { nextTestSetup } from 'e2e-utils'

const enabledConfig = `
/** @type {import('next').NextConfig} */
module.exports = {
  experimental: {
    webSocketRouteHandlers: true,
  },
}
`

describe('WebSocket Route Handler build/runtime config mismatch', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('fails closed with a complete response when start enables a build-disabled route', async () => {
    const originalConfig = await next.readFile('next.config.js')
    const build = await next.build()
    expect(build.exitCode).toBe(0)
    await next.patchFile('next.config.js', enabledConfig)

    try {
      await next.start({ skipBuild: true })
      const response = await new Promise<{
        status: number
        headers: http.IncomingHttpHeaders
        body: string
      }>((resolve, reject) => {
        const request = http.request({
          host: 'localhost',
          port: next.appPort,
          path: '/ws',
          headers: {
            connection: 'Upgrade',
            upgrade: 'websocket',
            'sec-websocket-key': Buffer.alloc(16).toString('base64'),
            'sec-websocket-version': '13',
          },
        })
        request.once('response', (incoming) => {
          const chunks: Buffer[] = []
          incoming.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
          incoming.once('end', () => {
            resolve({
              status: incoming.statusCode!,
              headers: incoming.headers,
              body: Buffer.concat(chunks).toString(),
            })
          })
        })
        request.once('upgrade', (_response, socket) => {
          socket.destroy()
          reject(new Error('build-disabled route unexpectedly upgraded'))
        })
        request.once('error', reject)
        request.setTimeout(5_000, () => {
          request.destroy(
            new Error('build-disabled route did not return an HTTP response')
          )
        })
        request.end()
      })

      expect(response).toEqual({
        status: 500,
        headers: expect.objectContaining({
          connection: 'close',
          'content-length': '0',
        }),
        body: '',
      })
    } finally {
      await next.stop().catch(() => {})
      await next.patchFile('next.config.js', originalConfig)
    }
  }, 120_000)
})
