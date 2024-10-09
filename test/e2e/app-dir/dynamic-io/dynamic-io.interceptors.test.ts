import { nextTestSetup } from 'e2e-utils'

const WITH_PPR = !!process.env.__NEXT_EXPERIMENTAL_PPR

describe('dynamic-io', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  if (WITH_PPR) {
    it('should partially prerender pages that use an interceptor', async () => {
      let $ = await next.render$('/interceptors', {})
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#inner-layout').text()).toBe('at runtime')
        expect($('#children').text()).toBe('at runtime')
      } else {
        expect($('#layout').text()).toBe('at buildtime')
        expect($('#inner-layout').text()).toBe('at buildtime')
        expect($('#children').text()).toBe('loading...')
      }
    })
  } else {
    it('should produce dynamic pages when using interceptors', async () => {
      let $ = await next.render$('/interceptors', {})
      expect($('#layout').text()).toBe('at runtime')
      expect($('#inner-layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
    })
  }
})
