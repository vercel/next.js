import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'app dir - draft mode',
  {
    files: __dirname,
  },
  ({ next, isNextDev }) => {
    let initialRand = 'unintialized'
    let Cookie = ''

    it('should use initial rand when draft mode is disabled', async () => {
      const $ = await next.render$('/')
      expect($('#mode').text()).toBe('DISABLED')
      expect($('#rand').text()).toBeDefined()
      initialRand = $('#rand').text()
    })

    if (!isNextDev) {
      it('should not generate rand when draft mode disabled during next start', async () => {
        const $ = await next.render$('/')
        expect($('#mode').text()).toBe('DISABLED')
        expect($('#rand').text()).toBe(initialRand)
      })
    }

    it('should be disabled from api route handler', async () => {
      const res = await next.fetch('/state')
      expect(await res.text()).toBe('DISABLED')
    })

    it('should have set-cookie header on enable', async () => {
      const res = await next.fetch('/enable')
      const h = res.headers.get('set-cookie') || ''
      Cookie = h.split(';').find((c) => c.startsWith('__prerender_bypass'))
      expect(Cookie).toBeDefined()
    })

    it('should have set-cookie header with redirect location', async () => {
      const res = await next.fetch('/enable-and-redirect', {
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
      const $ = await next.render$('/', {}, opts)
      expect($('#mode').text()).toBe('ENABLED')
      expect($('#rand').text()).not.toBe(initialRand)
    })

    it('should be enabled from api route handler when draft mode enabled', async () => {
      const opts = { headers: { Cookie } }
      const res = await next.fetch('/state', opts)
      expect(await res.text()).toBe('ENABLED')
    })
  }
)
