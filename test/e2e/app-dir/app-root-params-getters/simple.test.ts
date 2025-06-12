import { nextTestSetup } from 'e2e-utils'
import { assertNoRedbox } from 'next-test-utils'
import { join } from 'path'

describe('app-root-param-getters - simple', () => {
  const { next, isNextDev } = nextTestSetup({
    files: join(__dirname, 'fixtures', 'simple'),
  })

  it('should allow reading root params', async () => {
    const params = { lang: 'en', locale: 'us' }
    const $ = await next.render$(`/${params.lang}/${params.locale}`)
    expect($('p').text()).toBe(`hello world ${JSON.stringify(params)}`)
  })

  it('should render the not found page without errors', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('h2').text()).toBe(
      'This page could not be found.'
    )
    if (isNextDev) {
      await assertNoRedbox(browser)
    }
  })
})
