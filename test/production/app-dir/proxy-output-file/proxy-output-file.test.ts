import { nextTestSetup } from 'e2e-utils'
import {
  fetchViaHTTP,
  findPort,
  initNextServerScript,
  killApp,
} from 'next-test-utils'
import { join } from 'path'

// The output of a `proxy` file is `.next/server/middleware.js`, also while the
// build runs: a build step that looks for it under another name fails.
describe('proxy-output-file', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  async function fetchFromStandaloneServer() {
    const port = await findPort()
    const server = await initNextServerScript(
      join(next.testDir, '.next/standalone/server.js'),
      /- Local:/,
      { ...process.env, ...next.env, HOSTNAME: '::', PORT: `${port}` }
    )
    try {
      return await fetchViaHTTP(port, '/')
    } finally {
      await killApp(server)
    }
  }

  it('should build standalone output when a file trace lists the proxy output', async () => {
    const { exitCode } = await next.build({
      env: { TEST_CACHE_HANDLER: '1' },
    })
    expect(exitCode).toBe(0)

    // Turbopack doesn't trace the computed file name in `cache-handler.js`.
    if (!isTurbopack) {
      const trace = await next.readJSON('.next/next-server.js.nft.json')
      expect(trace.files).toContain('server/middleware.js')
    }

    const res = await fetchFromStandaloneServer()
    expect(res.status).toBe(200)
    expect(res.headers.get('x-from-proxy')).toBe('1')
  })

  it('should build in separate compile and generate passes', async () => {
    const compile = await next.build({
      args: ['--experimental-build-mode', 'compile'],
    })
    expect(compile.exitCode).toBe(0)

    const generate = await next.build({
      args: ['--experimental-build-mode', 'generate'],
    })
    expect(generate.exitCode).toBe(0)

    const res = await fetchFromStandaloneServer()
    expect(res.status).toBe(200)
    expect(res.headers.get('x-from-proxy')).toBe('1')
  })
})
