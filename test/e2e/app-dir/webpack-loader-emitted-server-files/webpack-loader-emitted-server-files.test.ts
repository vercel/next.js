import { nextTestSetup } from 'e2e-utils'
import {
  findPort,
  initNextServerScript,
  killApp,
  renderViaHTTP,
} from 'next-test-utils'
import { join, resolve, dirname } from 'path'

describe('webpack-loader-emitted-server-files', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it.each([
    ['/emitted', 'app-emitted-content\n'],
    ['/api/emitted', 'pages-emitted-content\n'],
  ])(
    'reads loader-emitted files at runtime from %s',
    async (route, content) => {
      const response = await next.fetch(route)
      expect(response.status).toBe(200)
      expect(await response.text()).toBe(content)
    }
  )

  // Deployed runtime reads above exercise packaging; only local builds expose trace manifests.
  // @force-gate !dev && !deploy
  it('includes emitted files only in the traces of routes that emit them', async () => {
    const emitted = (name: string) =>
      resolve(
        next.testDir,
        next.distDir,
        `server/chunks/loader-output/${name}.txt`
      ).replace(/\\/g, '/')
    const traces: Array<[string, string[]]> = [
      ['app/emitted/route.js', ['app']],
      ['pages/api/emitted.js', ['pages']],
      ['app/page.js', []],
      ['pages/_app.js', []],
    ]
    for (const [entry, expected] of traces) {
      const tracePath = join(next.distDir, 'server', `${entry}.nft.json`)
      const trace = JSON.parse(await next.readFile(tracePath))
      const files = trace.files
        .map((file: string) =>
          resolve(next.testDir, dirname(tracePath), file).replace(/\\/g, '/')
        )
        .filter((file: string) => file.includes('/loader-output/'))
      expect({ entry, files }).toEqual({ entry, files: expected.map(emitted) })
    }
  })

  // Like webpack, files from modules removed as unused are written but not traced.
  // @force-gate !dev && !deploy
  it('writes files emitted by unused modules without tracing them', async () => {
    expect(
      await next.readFile(
        join(next.distDir, 'server/chunks/loader-output/unused.txt')
      )
    ).toBe('unused-emitted-content\n')
  })

  // Standalone is self-hosted; deployed packaging is covered by the runtime assertions above.
  // @force-gate !dev && !deploy
  it('reads emitted files from the standalone server', async () => {
    const port = await findPort()
    const server = await initNextServerScript(
      join(next.testDir, next.distDir, 'standalone/server.js'),
      /- Local:/,
      { ...process.env, ...next.env, HOSTNAME: 'localhost', PORT: String(port) }
    )
    try {
      expect(await renderViaHTTP(port, '/emitted')).toBe(
        'app-emitted-content\n'
      )
      expect(await renderViaHTTP(port, '/api/emitted')).toBe(
        'pages-emitted-content\n'
      )
    } finally {
      await killApp(server)
    }
  })
})
