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

  // root params currently don't work in route handlers.
  it.failing(
    'should allow reading root params in a route handler',
    async () => {
      const params = { lang: 'en', locale: 'us' }
      const response = await next.fetch(
        `/${params.lang}/${params.locale}/route-handler`
      )
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual(params)
    }
  )
})
