import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'app dir - draft mode',
  {
    files: __dirname,
  },
  ({ next, isNextDev }) => {
    let initialRand = 'unintialized'

    it('should use initial rand when draft mode be disabled', async () => {
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

    it('should genenerate rand when draft mode enabled', async () => {
      const res = await next.fetch('/enable')
      const h = res.headers.get('set-cookie') || ''
      const Cookie = h
        .split(';')
        .find((c) => c.startsWith('__prerender_bypass'))
      const opts = { headers: { Cookie } }
      const $ = await next.render$('/', {}, opts)
      expect($('#mode').text()).toBe('ENABLED')
      expect($('#rand').text()).not.toBe(initialRand)
    })
  }
)
