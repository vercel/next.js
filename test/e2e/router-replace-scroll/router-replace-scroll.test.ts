import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('router.replace with scroll options', () => {
  describe.each([
    {
      name: 'without loading.tsx',
      setup: () => nextTestSetup({ files: __dirname }),
    },
    {
      name: 'with loading.tsx',
      setup: () =>
        nextTestSetup({
          files: __dirname,
          overrideFiles: {
            'app/loading.tsx': `
            export default function Loading() {
              return <div>Loading...</div>
            }
          `,
          },
        }),
    },
  ])('$name', ({ setup }) => {
    const { next } = setup()

    it('should scroll to top when scroll: true is set', async () => {
      const browser = await next.browser('/')

      // Wait for page to load
      await browser.waitForElementByCss('#home-title')

      // Scroll down to the bottom
      await browser.eval(() => {
        document.querySelector('#bottom-marker')?.scrollIntoView()
      })

      // Verify we've scrolled down
      const scrollPositionBefore = await browser.eval('window.pageYOffset')
      expect(scrollPositionBefore).toBeGreaterThan(1000)

      // Click the button that replaces with scroll: true
      await browser.elementByCss('#replace-foo-bar-scroll-true').click()

      // Wait for navigation to complete and check URL changed
      await retry(async () => {
        const url = await browser.url()
        expect(url).toContain('foo=bar')
      })

      // Check that we scrolled to top
      await retry(async () => {
        const scrollPositionAfter = await browser.eval('window.pageYOffset')
        expect(scrollPositionAfter).toBe(0)
      })
    })
  })
})
