import { FileRef, createNext, NextInstance } from 'e2e-utils'
import { findPort, renderViaHTTP, fetchViaHTTP } from 'next-test-utils'
import { join } from 'path'
import spawn from 'cross-spawn'

describe('next/font/google with proxy', () => {
  let next: NextInstance
  let proxy: any
  let PROXY_PORT: number
  let SERVER_PORT: number

  if ((global as any).isNextDeploy) {
    it('should skip next deploy', () => {})
    return
  }

  beforeAll(async () => {
    PROXY_PORT = await findPort()
    SERVER_PORT = await findPort()

    proxy = spawn('node', [require.resolve('./with-proxy/server.js')], {
      stdio: 'inherit',
      env: {
        ...process.env,
        PROXY_PORT: PROXY_PORT.toString(),
        SERVER_PORT: SERVER_PORT.toString(),
      },
    })

    next = await createNext({
      files: new FileRef(join(__dirname, 'with-proxy')),
      env: {
        http_proxy: 'http://localhost:' + PROXY_PORT,
      },
    })
  })
  afterAll(async () => {
    await next.destroy()
    proxy.kill('SIGKILL')
  })

  // Reqwest doesn't seem to fully work with https proxy
  ;(process.env.IS_TURBOPACK_TEST ? it.skip : it)(
    'should use a proxy agent when proxy environment variable is set',
    async () => {
      await renderViaHTTP(next.url, '/')

      const proxiedRequests = await fetchViaHTTP(SERVER_PORT, '/requests').then(
        (r) => r.json()
      )
      // eslint-disable-next-line jest/no-standalone-expect
      expect(proxiedRequests).toContain(
        '/css2?family=Oswald:wght@200..700&display=swap'
      )
      // eslint-disable-next-line jest/no-standalone-expect
      expect(proxiedRequests).toContain(
        '/s/oswald/v49/TK3iWkUHHAIjg752FD8Gl-1PK62t.woff2'
      )
      // eslint-disable-next-line jest/no-standalone-expect
      expect(proxiedRequests).toContain(
        '/s/oswald/v49/TK3iWkUHHAIjg752HT8Gl-1PK62t.woff2'
      )
      // eslint-disable-next-line jest/no-standalone-expect
      expect(proxiedRequests).toContain(
        '/s/oswald/v49/TK3iWkUHHAIjg752Fj8Gl-1PK62t.woff2'
      )
      // eslint-disable-next-line jest/no-standalone-expect
      expect(proxiedRequests).toContain(
        '/s/oswald/v49/TK3iWkUHHAIjg752GT8Gl-1PKw.woff2'
      )
      // eslint-disable-next-line jest/no-standalone-expect
      expect(proxiedRequests).toContain(
        '/s/oswald/v49/TK3iWkUHHAIjg752Fz8Gl-1PK62t.woff2'
      )
    }
  )
})
