import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('global-css-custom-loader', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    dependencies: {
      '@tailwindcss/postcss': '4.1.18',
      tailwindcss: '4.1.18',
    },
  })

  it('serves current global CSS after an edit through a custom loader', async () => {
    const $ = await next.render$('/')
    const cssHref = $('link[rel="stylesheet"]').first().attr('href')
    expect(cssHref).toBeDefined()

    async function fetchStylesheet() {
      const response = await next.fetch(cssHref, { cache: 'no-store' })
      expect(response.status).toBe(200)
      return response.text()
    }

    const initialCss = await fetchStylesheet()
    expect(initialCss).toContain('INITIAL_MARKER')

    // Production and deployed apps serve compiled CSS, but cannot apply live edits.
    if (isNextDev) {
      expect(next.cliOutput).toContain('custom-css-loader-ran')

      await next.patchFile(
        'app/globals.css',
        (content) => content.replace('INITIAL_MARKER', 'EDITED_MARKER_1'),
        async () => {
          // Request the original chunk URL without refreshing the page or restarting
          // the server, which could hide failed stylesheet invalidation.
          await retry(async () => {
            const updatedCss = await fetchStylesheet()
            expect(updatedCss).toContain('EDITED_MARKER_1')
            expect(updatedCss).not.toContain('INITIAL_MARKER')
          })
        }
      )
    }
  })
})
