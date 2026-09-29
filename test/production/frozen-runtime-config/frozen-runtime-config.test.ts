import { nextTestSetup } from 'e2e-utils'
import cheerio from 'cheerio'

describe('frozen-runtime-config', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    startCommand: 'node server.js',
    serverReadyPattern: /- Local:/,
    // This test controls the launcher to force manifest fallback without a
    // router-server config override; the deployed launcher is platform-owned.
    skipDeployment: true,
  })
  if (skipped) return

  it('renders public image APIs with the frozen runtime config', async () => {
    const response = await next.fetch('/')
    expect(response.status).toBe(200)
    const $ = cheerio.load(await response.text())
    for (const id of ['modern', 'legacy', 'props']) {
      expect($(`#${id}`).attr('src')).toContain(
        '/custom-image?url=%2Ftest.png&w=256&q=60'
      )
    }
  })
})
