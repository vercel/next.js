import { nextTestSetup } from 'e2e-utils'

describe('cache-components', () => {
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

  it("should prerender pages with cached `require('node:crypto').getRandomValues(...)` calls", async () => {
    let $ = await next.render$('/node-crypto/get-random-values/cached', {})
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

  it("should prerender pages with cached `require('node:crypto').randomUUID()` calls", async () => {
    let $ = await next.render$('/node-crypto/random-uuid/cached', {})
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

  it("should prerender pages with cached `require('node:crypto').randomBytes(size)` calls", async () => {
    let $ = await next.render$('/node-crypto/random-bytes/cached', {})
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

  it("should prerender pages with cached `require('node:crypto').randomFillSync(buffer)` calls", async () => {
    let $ = await next.render$('/node-crypto/random-fill-sync/cached', {})
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

  it("should prerender pages with cached `require('node:crypto').randomInt(max)` calls", async () => {
    let $ = await next.render$('/node-crypto/random-int/up-to/cached', {})
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

  it("should prerender pages with cached `require('node:crypto').randomInt(min, max)` calls", async () => {
    let $ = await next.render$('/node-crypto/random-int/between/cached', {})
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

  it("should prerender pages with cached `require('node:crypto').generatePrimeSync(size, options)` calls", async () => {
    let $ = await next.render$('/node-crypto/generate-prime-sync/cached', {})
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

  it("should prerender pages with cached `require('node:crypto').generateKeyPairSync(type, options)` calls", async () => {
    let $ = await next.render$('/node-crypto/generate-key-pair-sync/cached', {})
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

  it("should prerender pages with cached `require('node:crypto').generateKeySync(type, options)` calls", async () => {
    let $ = await next.render$('/node-crypto/generate-key-sync/cached', {})
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
})
