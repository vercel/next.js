import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('fallback-shell-cache-invalidation', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render a fresh cached value for a prerendered param after its tag is updated', async () => {
    const $ = await next.render$('/fsci/a')
    const initialValue = $('#for-slug').text()
    expect(initialValue).not.toBe('')

    const browser = await next.browser('/fsci/actions')
    await browser.elementByCss('#update-slug-a').click()

    await retry(async () => {
      const $ = await next.render$('/fsci/a')
      const value = $('#for-slug').text()
      expect(value).not.toBe('')
      expect(value).not.toBe(initialValue)
    })
  })

  it('should render a fresh cached value for a param without a prerender after a tag shared with a prerendered param is updated', async () => {
    const $ = await next.render$('/fsci/b')
    const initialValue = $('#shared').text()
    expect(initialValue).not.toBe('')

    const browser = await next.browser('/fsci/actions')
    await browser.elementByCss('#update-shared').click()

    await retry(async () => {
      const $ = await next.render$('/fsci/b')
      const value = $('#shared').text()
      expect(value).not.toBe('')
      expect(value).not.toBe(initialValue)
    })
  })
})
