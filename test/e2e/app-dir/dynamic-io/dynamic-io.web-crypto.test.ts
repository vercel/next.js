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

  it('should not have route specific errors', async () => {
    expect(next.cliOutput).not.toMatch('Error: Route "/')
    expect(next.cliOutput).not.toMatch('Error occurred prerendering page')
  })

  it('should prerender pages with cached `crypto.getRandomValues(...)` calls', async () => {
    let $ = await next.render$('/web-crypto/get-random-values/cached', {})
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
      expect($('#first').text()).not.toEqual($('#second').text())
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
      expect($('#first').text()).not.toEqual($('#second').text())
    }
  })

  it('should not prerender pages with uncached `crypto.getRandomValues(...)` calls', async () => {
    let $ = await next.render$('/web-crypto/get-random-values/uncached', {})
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
      expect($('#first').text()).not.toEqual($('#second').text())
    } else if (WITH_PPR) {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at runtime')
      expect($('#first').text()).not.toEqual($('#second').text())
    } else {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
      expect($('#first').text()).not.toEqual($('#second').text())
    }
  })

  it('should prerender pages with cached `crypto.randomUUID()` calls', async () => {
    let $ = await next.render$('/web-crypto/random-uuid/cached', {})
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
      expect($('#first').text()).not.toEqual($('#second').text())
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
      expect($('#first').text()).not.toEqual($('#second').text())
    }
  })

  it('should not prerender pages with uncached `crypto.randomUUID()` calls', async () => {
    let $ = await next.render$('/web-crypto/random-uuid/uncached', {})
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
      expect($('#first').text()).not.toEqual($('#second').text())
    } else if (WITH_PPR) {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at runtime')
      expect($('#first').text()).not.toEqual($('#second').text())
    } else {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
      expect($('#first').text()).not.toEqual($('#second').text())
    }
  })
})
