import { nextTestSetup } from 'e2e-utils'
import https from 'https'
import { renderViaHTTP, shouldRunTurboDevTest } from 'next-test-utils'

describe('experimental-https-server OpenGraph image', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    startCommand: `pnpm next ${
      shouldRunTurboDevTest() ? 'dev --turbo' : 'dev'
    } --experimental-https`,
    skipStart: !process.env.NEXT_TEST_CI,
  })
  if (skipped) return

  if (!process.env.NEXT_TEST_CI) {
    console.warn('only runs on CI as it requires administrator privileges')
    it('only runs on CI as it requires administrator privileges', () => {})
    return
  }

  const agent = new https.Agent({
    rejectUnauthorized: false,
  })

  it('should generate https:// URLs for OpenGraph images when experimental HTTPS is enabled', async () => {
    expect(next.url).toInclude('https://')

    // Get the page HTML that should contain the OpenGraph image meta tag
    const html = await renderViaHTTP(next.url, '/opengraph', undefined, {
      agent,
    })

    // Check that the page loads successfully
    expect(html).toContain('OpenGraph Test Page')

    // Check that OpenGraph image URLs use https:// protocol
    const ogImageMatch = html.match(
      /<meta property="og:image" content="([^"]+)"/
    )
    expect(ogImageMatch).toBeTruthy()

    if (ogImageMatch) {
      const ogImageUrl = ogImageMatch[1]
      console.log('Generated OpenGraph image URL:', ogImageUrl)

      // This is the core test: the URL should use https:// not http://
      expect(ogImageUrl).toMatch(/^https:\/\/localhost:\d+\/opengraph-image/)
      expect(ogImageUrl).not.toMatch(/^http:\/\//)
    }

    // Check that Twitter card image URLs use https:// protocol
    const twitterCardImageMatch = html.match(
      /<meta property="twitter:image" content="([^"]+)"/
    )
    expect(twitterCardImageMatch).toBeTruthy()

    if (twitterCardImageMatch) {
      const twitterCardImageUrl = twitterCardImageMatch[1]
      console.log('Generated Twitter card image URL:', twitterCardImageUrl)

      // This is the core test: the URL should use https:// not http://
      expect(twitterCardImageUrl).toMatch(
        /^https:\/\/localhost:\d+\/opengraph-image/
      )
      expect(twitterCardImageUrl).not.toMatch(/^http:\/\//)
    }
  })
})
