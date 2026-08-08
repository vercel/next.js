import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('Hash changes i18n', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should update props on locale change with same hash', async () => {
    const browser = await next.browser('/about#hash')

    await browser.elementByCss('#change-locale').click()

    await retry(async () => {
      expect(await browser.eval('window.location.pathname')).toBe('/fr/about')
    })
    await retry(async () => {
      expect(await browser.eval('window.location.hash')).toBe('#hash')
    })

    expect(await browser.elementByCss('#router-locale').text()).toBe('fr')
    expect(await browser.elementByCss('#props-locale').text()).toBe('fr')

    await browser.elementByCss('#change-locale').click()

    await retry(async () => {
      expect(await browser.eval('window.location.pathname')).toBe('/about')
    })
    await retry(async () => {
      expect(await browser.eval('window.location.hash')).toBe('#hash')
    })

    expect(await browser.elementByCss('#router-locale').text()).toBe('en')
    expect(await browser.elementByCss('#props-locale').text()).toBe('en')
  })

  it('should update props on locale change with same hash (dynamic page)', async () => {
    const browser = await next.browser('/posts/a#hash')

    await browser.elementByCss('#change-locale').click()

    await retry(async () => {
      expect(await browser.eval('window.location.pathname')).toBe('/fr/posts/a')
    })
    await retry(async () => {
      expect(await browser.eval('window.location.hash')).toBe('#hash')
    })

    // The URL can update before the component re-renders with the new locale
    // (observed with webpack production builds). Wait for the render to
    // reflect the new locale before asserting the remaining render state.
    await retry(async () => {
      expect(await browser.elementByCss('#router-locale').text()).toBe('fr')
    })
    expect(await browser.elementByCss('#props-locale').text()).toBe('fr')

    await browser.elementByCss('#change-locale').click()

    await retry(async () => {
      expect(await browser.eval('window.location.pathname')).toBe('/posts/a')
    })
    await retry(async () => {
      expect(await browser.eval('window.location.hash')).toBe('#hash')
    })

    await retry(async () => {
      expect(await browser.elementByCss('#router-locale').text()).toBe('en')
    })
    expect(await browser.elementByCss('#props-locale').text()).toBe('en')
  })

  it('should trigger hash change events', async () => {
    const browser = await next.browser('/about#hash')

    await retry(async () => {
      expect(await browser.eval('window.location.hash')).toBe('#hash')
    })

    await browser.elementByCss('#hash-change').click()

    await retry(async () => {
      expect(await browser.eval('window.hashChangeStart')).toBe('yes')
    })
    await retry(async () => {
      expect(await browser.eval('window.hashChangeComplete')).toBe('yes')
    })

    await retry(async () => {
      expect(await browser.eval('window.location.hash')).toBe('#newhash')
    })
  })
})
