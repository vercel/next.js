import { nextTestSetup } from 'e2e-utils'
import expect from 'expect'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It likely asserts local CLI or runtime output that deploy tests do not expose.
// @force-gate !deploy
describe('cache-components', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  it('should not have route specific errors', async () => {
    expect(next.cliOutput).not.toMatch('Error: Route "/')
    expect(next.cliOutput).not.toMatch('Error occurred prerendering page')
  })

  it('should prerender pages with cached `Date.now()` calls', async () => {
    let $ = await next.render$('/date/now/cached', {})
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
      expect($('#value').text()).toMatch(/^\d+$/)
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
      expect($('#value').text()).toMatch(/^\d+$/)
    }
  })

  it('should prerender pages with cached `Date()` calls', async () => {
    let $ = await next.render$('/date/date/cached', {})
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
      expect($('#value').text()).toContain('GMT')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
      expect($('#value').text()).toContain('GMT')
    }
  })

  it('should prerender pages with cached `new Date()` calls', async () => {
    let $ = await next.render$('/date/new-date/cached', {})
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
      expect($('#value').text()).toContain('GMT')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
      expect($('#value').text()).toContain('GMT')
    }
  })

  it('should prerender pages with cached static Date instances like `new Date(0)`', async () => {
    let $ = await next.render$('/date/static-date/cached', {})
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
      expect($('#value').text()).toContain('GMT')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
      expect($('#value').text()).toContain('GMT')
    }
  })

  it('should not prerender pages with uncached static Date instances like `new Date(0)`', async () => {
    let $ = await next.render$('/date/static-date/uncached', {})
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
      expect($('#value').text()).toContain('GMT')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
      expect($('#value').text()).toContain('GMT')
    }
  })
})
