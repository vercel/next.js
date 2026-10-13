import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { expectedText, expectedBytes } from './data'

describe('Flight native chunks', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it('preserves Flight text, binary slices and promise values during SSR', async () => {
    const $ = await next.render$('/')
    expect($('#text').text()).toBe(expectedText)
    expect($('#bytes').text()).toBe(expectedBytes)
    expect($('#last-code-unit').text()).toBe('65533')
    expect($('#later-code-unit').text()).toBe('65533')
  })

  it('hydrates the same values without executing embedded script text', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('#text').text()).toBe(expectedText)
    expect(await browser.elementByCss('#bytes').text()).toBe(expectedBytes)
    expect(await browser.elementByCss('#last-code-unit').text()).toBe('65533')
    expect(await browser.elementByCss('#later-code-unit').text()).toBe('65533')
    expect(await browser.eval('window.__flightInjected || null')).toBeNull()
    await browser.elementByCss('button').click()
    await retry(async () => {
      expect(await browser.elementByCss('button').text()).toBe('1')
    })
  })
})
