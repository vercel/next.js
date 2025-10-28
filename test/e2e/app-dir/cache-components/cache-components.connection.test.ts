import { nextTestSetup } from 'e2e-utils'

describe('cache-components', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

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

  it('should be able to pass connection as a promise to another component and trigger an intermediate Suspense boundary', async () => {
    const $ = await next.render$('/connection/static-behavior/pass-deeply')
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      // In dev, whether or not the fallback appears in the HTML is unreliable
      // and depends on timing, so we don't assert on its presence
      // (if we want to assert on it, we should use a browser test)
      expect($('#page').text()).toBe('at runtime')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#fallback').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at runtime')
    }
  })
})
