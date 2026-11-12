import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('gtm-datalayer-xss', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      '@next/third-parties': 'workspace:*',
    },
  })

  const payload = '</script><script>window.__xss_gtm=1</script>'

  describe.each([
    ['app router', '/'],
    ['pages router', '/pages-router'],
  ])('%s', (_, basePath) => {
    const path = `${basePath}?q=${encodeURIComponent(payload)}`

    it('does not serve the dataLayer value unescaped in the HTML document', async () => {
      const res = await next.fetch(path)
      const html = await res.text()
      // The raw breakout sequence must not appear anywhere in the document.
      expect(html).not.toContain(payload)
      // In particular the GTM init script must not embed it unescaped.
      const $ = await next.render$(path)
      const initScript = $('script#_next-gtm-init').html() ?? ''
      expect(initScript).not.toContain('</script>')
      expect(initScript).not.toContain('window.__xss_gtm')
    })

    it('does not execute markup injected through the dataLayer value', async () => {
      const browser = await next.browser(path)
      // The init script is injected client-side, so wait until it ran:
      // the dataLayer feature itself keeps working and the value arrives intact.
      await retry(async () => {
        const dataLayer = await browser.eval('window.dataLayer')
        expect(JSON.stringify(dataLayer)).toContain(
          '</script><script>window.__xss_gtm=1</script>'
        )
      })
      // If the payload broke out of the inline script tag, this would be 1.
      expect(await browser.eval('window.__xss_gtm')).toBeUndefined()
    })
  })
})
