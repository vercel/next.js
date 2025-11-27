import { nextTestSetup } from 'e2e-utils'

describe('pages-get-initial-props-error', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render _error with 500 status code when getInitialProps throws', async () => {
    const browser = await next.browser('/gip-error')
    expect(await browser.elementByCss('p').text()).toBe(
      'An error 500 occurred on server'
    )

    const response = await next.fetch('/gip-error')
    expect(response.status).toBe(500)
  })
})
