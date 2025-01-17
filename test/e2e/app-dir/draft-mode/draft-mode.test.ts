import { nextTestSetup } from 'e2e-utils'
import { waitFor } from 'next-test-utils'

describe('app dir - draft mode', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  async function runTests({ basePath = '/' }: { basePath: string }) {
    let origRandHome = 'unintialized'
    let origRandWithCookies = 'unintialized'
    let Cookie = ''

    it(`should use initial rand when draft mode is disabled on ${basePath}index`, async () => {
      const $ = await next.render$(basePath)
      expect($('#mode').text()).toBe('DISABLED')
      expect($('#rand').text()).toBeDefined()
      origRandHome = $('#rand').text()
    })

    it(`should use initial rand when draft mode is disabled on ${basePath}with-cookies`, async () => {
      const $ = await next.render$(`${basePath}with-cookies`)
      expect($('#mode').text()).toBe('DISABLED')
      expect($('#rand').text()).toBeDefined()
      expect($('#data').text()).toBe('')
      origRandWithCookies = $('#rand').text()
    })

    if (!isNextDev) {
      if (basePath === '/') {
        it('should not generate rand when draft mode disabled during next start', async () => {
          const $ = await next.render$(basePath)
          expect($('#mode').text()).toBe('DISABLED')
          expect($('#rand').text()).toBe(origRandHome)
        })
      }

      it('should not read other cookies when draft mode disabled during next start', async () => {
        const opts = { headers: { Cookie: `data=cool` } }
        const $ = await next.render$(`${basePath}with-cookies`, {}, opts)
        expect($('#mode').text()).toBe('DISABLED')
        expect($('#data').text()).toBe('')
      })
    }

    it('should be disabled from api route handler', async () => {
      const res = await next.fetch(`${basePath}state`)
      expect(await res.text()).toBe('DISABLED')
    })

    it('should have set-cookie header on enable', async () => {
      const res = await next.fetch(`${basePath}enable`)
      const h = res.headers.get('set-cookie') || ''
      Cookie = h.split(';').find((c) => c.startsWith('__prerender_bypass'))
      expect(Cookie).toBeDefined()
    })

    it('should have set-cookie header with redirect location', async () => {
      const res = await next.fetch(`${basePath}enable-and-redirect`, {
        redirect: 'manual',
      })
      expect(res.status).toBe(307)
      expect(res.headers.get('location')).toContain('/some-other-page')
      const h = res.headers.get('set-cookie') || ''
      const c = h.split(';').find((c) => c.startsWith('__prerender_bypass'))
      expect(c).toBeDefined()
    })

    it('should generate rand when draft mode enabled', async () => {
      const opts = { headers: { Cookie } }
      const $ = await next.render$(basePath, {}, opts)
      expect($('#mode').text()).toBe('ENABLED')
      expect($('#rand').text()).not.toBe(origRandHome)
    })

    it('should read other cookies when draft mode enabled', async () => {
      const opts = { headers: { Cookie: `${Cookie};data=cool` } }
      const $ = await next.render$(`${basePath}with-cookies`, {}, opts)
      expect($('#mode').text()).toBe('ENABLED')
      expect($('#rand').text()).not.toBe(origRandWithCookies)
      expect($('#data').text()).toBe('cool')
    })

    it('should be enabled from api route handler when draft mode enabled', async () => {
      const opts = { headers: { Cookie } }
      const res = await next.fetch(`${basePath}state`, opts)
      expect(await res.text()).toBe('ENABLED')
    })

    it('should not perform full page navigation on router.refresh()', async () => {
      const to = encodeURIComponent('/generate/foo')
      const browser = await next.browser(
        `${basePath}enable-and-redirect?to=${to}`
      )
      await browser.eval('window._test = 42')
      await browser.elementById('refresh').click()

      const start = Date.now()
      while (Date.now() - start < 5000) {
        const value = await browser.eval('window._test')
        if (value !== 42) {
          throw new Error('Detected a full page navigation')
        }
        await waitFor(200)
      }

      expect(await browser.eval('window._test')).toBe(42)
    })
  }

  describe('in nodejs runtime', () => {
    runTests({ basePath: '/' })
  })

  describe('in edge runtime', () => {
    runTests({ basePath: '/with-edge/' })
  })
})
