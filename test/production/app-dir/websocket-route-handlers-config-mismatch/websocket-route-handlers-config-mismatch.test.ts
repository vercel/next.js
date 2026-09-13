import { nextTestSetup } from 'e2e-utils'
import { requestWebSocketUpgrade } from 'next-websocket-test-utils'

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
      const response = await requestWebSocketUpgrade(next, '/ws', {
        // The build-disabled route must answer a complete HTTP response, not
        // a 101 upgrade.
        rejectOnUpgrade: true,
        timeoutMs: 5_000,
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
