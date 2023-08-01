import { createNextDescribe } from 'e2e-utils'
import { waitFor } from 'next-test-utils'

createNextDescribe(
  'app dir - draft mode edge',
  {
    files: __dirname,
  },
  ({ next }) => {
    let origRandHome = 'unintialized'
    let origRandWithCookies = 'unintialized'
    let Cookie = ''

    it('should use initial rand when draft mode is disabled on /index', async () => {
      const $ = await next.render$('/with-edge')
      expect($('#mode').text()).toBe('DISABLED')
      expect($('#rand').text()).toBeDefined()
      origRandHome = $('#rand').text()
    })

    it('should use initial rand when draft mode is disabled on /with-cookies', async () => {
      const $ = await next.render$('/with-edge/with-cookies')
      expect($('#mode').text()).toBe('DISABLED')
      expect($('#rand').text()).toBeDefined()
      expect($('#data').text()).toBe('')
      origRandWithCookies = $('#rand').text()
    })

    it('should be disabled from api route handler', async () => {
      const res = await next.fetch('/with-edge/state')
      expect(await res.text()).toBe('DISABLED')
    })

    it('should have set-cookie header on enable', async () => {
      const res = await next.fetch('/with-edge/enable')
      const h = res.headers.get('set-cookie') || ''
      Cookie = h.split(';').find((c) => c.startsWith('__prerender_bypass'))
      expect(Cookie).toBeDefined()
    })

    it('should have set-cookie header with redirect location', async () => {
      const res = await next.fetch('/with-edge/enable-and-redirect', {
        redirect: 'manual',
      })
      expect(res.status).toBe(307)
      expect(res.headers.get('location')).toContain('/some-other-page')
      const h = res.headers.get('set-cookie') || ''
      const c = h.split(';').find((c) => c.startsWith('__prerender_bypass'))
      expect(c).toBeDefined()
    })

    it('should genenerate rand when draft mode enabled', async () => {
      const opts = { headers: { Cookie } }
      const $ = await next.render$('/with-edge', {}, opts)
      expect($('#mode').text()).toBe('ENABLED')
      expect($('#rand').text()).not.toBe(origRandHome)
    })

    it('should read other cookies when draft mode enabled', async () => {
      const opts = { headers: { Cookie: `${Cookie};data=cool` } }
      const $ = await next.render$('/with-edge/with-cookies', {}, opts)
      expect($('#mode').text()).toBe('ENABLED')
      expect($('#rand').text()).not.toBe(origRandWithCookies)
      expect($('#data').text()).toBe('cool')
    })

    it('should be enabled from api route handler when draft mode enabled', async () => {
      const opts = { headers: { Cookie } }
      const res = await next.fetch('/with-edge/state', opts)
      expect(await res.text()).toBe('ENABLED')
    })

    it('should not perform full page navigation on router.refresh()', async () => {
      const to = encodeURIComponent('/generate/foo')
      const browser = await next.browser(
        `/with-edge/enable-and-redirect?to=${to}`
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
)
