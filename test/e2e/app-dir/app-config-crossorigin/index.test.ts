import { nextTestSetup } from 'e2e-utils'

describe('app dir - crossOrigin config', () => {
  const { next, isNextStart, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  if (isNextStart) {
    it('skip in start mode', () => {})
    return
  }
  it('should render correctly with assetPrefix: "/"', async () => {
    const $ = await next.render$('/')
    // Only potential external (assetPrefix) <script /> and <link /> should have crossorigin attribute
    $(
      'script[src*="https://example.vercel.sh"], link[href*="https://example.vercel.sh"]'
    ).each((_, el) => {
      const crossOrigin = $(el).attr('crossorigin')
      expect(crossOrigin).toBe('use-credentials')
    })

    // Inline <script /> (including RSC payload) and <link /> should not have crossorigin attribute
    $('script:not([src]), link:not([href])').each((_, el) => {
      const crossOrigin = $(el).attr('crossorigin')
      expect(crossOrigin).toBeUndefined()
    })

    // Same origin <script /> and <link /> should not have crossorigin attribute either
    $('script[src^="/"], link[href^="/"]').each((_, el) => {
      const crossOrigin = $(el).attr('crossorigin')
      expect(crossOrigin).toBeUndefined()
    })
  })
})
