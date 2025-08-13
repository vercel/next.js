import { nextTestSetup } from 'e2e-utils'

describe('experimental-https-server OpenGraph image', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    startCommand: 'pnpm next dev --experimental-https',
    skipStart: !process.env.NEXT_TEST_CI,
  })
  if (skipped) return

  if (!process.env.NEXT_TEST_CI) {
    console.warn('only runs on CI as it requires administrator privileges')
    it('only runs on CI as it requires administrator privileges', () => {})
    return
  }

  it('should generate https:// URLs for OpenGraph images when experimental HTTPS is enabled', async () => {
    expect(next.url).toContain('https://')
    const browser = await next.browser('/1', {
      ignoreHTTPSErrors: true,
    })
    const html = await browser.eval('document.documentElement.innerHTML')
    expect(html).toContain('Hello from App')
    expect(html).toMatch(/<meta property="og:image" content="https:\/\//)
    expect(html).toMatch(/<meta name="twitter:image" content="https:\/\//)
  })
})
