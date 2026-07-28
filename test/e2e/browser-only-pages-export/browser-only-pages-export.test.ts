import { join } from 'node:path'
import type { Server } from 'node:net'
import { isNextDev, isReact18, nextTestSetup } from 'e2e-utils'
import { renderViaHTTP, startCleanStaticServer } from 'next-test-utils'

describe('browserOnly in a Pages Router static export', () => {
  if (isReact18) {
    it.skip('requires React 19 or later', () => {})
    return
  }

  if (isNextDev || process.env.__NEXT_CACHE_COMPONENTS === 'true') {
    it.skip('requires an export-compatible production build', () => {})
    return
  }

  const { next, skipped } = nextTestSetup({
    files: __dirname,
    nextConfig: {
      output: 'export',
    },
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  let server: Server
  let port: number

  beforeAll(async () => {
    const result = await next.build()
    expect(result.exitCode).toBe(0)

    server = await startCleanStaticServer(join(next.testDir, 'out'))
    const address = server.address()
    if (address === null || typeof address === 'string') {
      throw new Error('Expected the static export server to listen on a port')
    }
    port = address.port
  })

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  it('exports the fallback and hydrates browser-only content', async () => {
    const html = await renderViaHTTP(port, '/')
    expect(html).toContain('pages server sibling')
    expect(html).toContain('pages fallback')
    expect(html.includes('id="pages-browser-content"')).toBe(false)

    const browser = await next.browser('/', {
      baseUrl: port,
      pushErrorAsConsoleLog: true,
    })
    expect(await browser.elementByCss('#pages-browser-content').text()).toBe(
      'pages browser content'
    )

    const logs = await browser.log()
    expect(logs.filter((entry) => entry.source === 'error')).toEqual([])
    expect(
      next.cliOutput.includes(
        'Bail out to client-side rendering: browserOnly()'
      )
    ).toBe(false)
  })
})
