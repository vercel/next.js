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
    it('should partially prerender pages that use connection', async () => {
      let $ = await next.render$('/connection/static-behavior/boundary', {})
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#foo').text()).toBe('foo')
      } else {
        expect($('#layout').text()).toBe('at buildtime')
        expect($('#page').text()).toBe('at buildtime')
        expect($('#foo').text()).toBe('foo')
      }
    })
  } else {
    it('should produce dynamic pages when using connection', async () => {
      let $ = await next.render$('/connection/static-behavior/boundary', {})
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#foo').text()).toBe('foo')
      } else {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#foo').text()).toBe('foo')
      }
    })
  }

  if (WITH_PPR) {
    it('should be able to pass connection as a promise to another component and trigger an intermediate Suspense boundary', async () => {
      const $ = await next.render$('/connection/static-behavior/pass-deeply')
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#fallback').length).toBe(0)
        expect($('#page').text()).toBe('at runtime')
      } else {
        expect($('#layout').text()).toBe('at buildtime')
        expect($('#fallback').text()).toBe('at buildtime')
        expect($('#page').text()).toBe('at runtime')
      }
    })
  }
})
