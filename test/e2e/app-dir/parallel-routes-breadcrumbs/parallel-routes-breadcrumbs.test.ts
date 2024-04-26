import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('parallel-routes-breadcrumbs', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should provide an unmatched catch-all route with params', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss("[href='/artist1']").click()

    const slot = await browser.waitForElementByCss('#slot')

    // verify page is rendering the params
    expect(await browser.elementByCss('h2').text()).toBe('Artist: artist1')

    // verify slot is rendering the params
    expect(await slot.text()).toContain('Artist: artist1')
    expect(await slot.text()).toContain('Album: Select an album')
    expect(await slot.text()).toContain('Track: Select a track')

    await browser.elementByCss("[href='/artist1/album2']").click()

    await retry(async () => {
      // verify page is rendering the params
      expect(await browser.elementByCss('h2').text()).toBe('Album: album2')
    })

    // verify slot is rendering the params
    expect(await slot.text()).toContain('Artist: artist1')
    expect(await slot.text()).toContain('Album: album2')
    expect(await slot.text()).toContain('Track: Select a track')

    await browser.elementByCss("[href='/artist1/album2/track3']").click()

    await retry(async () => {
      // verify page is rendering the params
      expect(await browser.elementByCss('h2').text()).toBe('Track: track3')
    })

    // verify slot is rendering the params
    expect(await slot.text()).toContain('Artist: artist1')
    expect(await slot.text()).toContain('Album: album2')
    expect(await slot.text()).toContain('Track: track3')
  })
})
