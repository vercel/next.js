import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('actions-progressive-enhancement-ppr', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
  })

  it('should respond with a full document when a form is submitted without JS', async () => {
    if (isNextStart) {
      // The page must be partially prerendered for the action to be able to
      // resume from its postponed state.
      const res = await next.fetch('/')
      expect(res.headers.get('x-nextjs-postponed')).toBe('1')
    }

    const browser = await next.browser('/', { disableJavaScript: true })
    expect(await browser.elementByCss('#form-state').text()).toBe(
      'Submitted 0 time(s) as -'
    )

    await browser.elementByCss('#submit').click()

    await retry(async () => {
      expect(await browser.elementByCss('#form-state').text()).toBe(
        'Submitted 1 time(s) as Ada'
      )
    })

    // The response must include the static shell, not only the resumed
    // dynamic parts of the page.
    expect(await browser.eval('document.compatMode')).toBe('CSS1Compat')
    expect(await browser.elementByCss('#static-shell').text()).toBe(
      'Static shell'
    )
  })

  it('should update the form state with a fetch action when JS is enabled', async () => {
    const browser = await next.browser('/')
    await browser.waitForElementByCss('#hydrated')

    const actionRequests: Array<string | undefined> = []
    browser.on('request', (request) => {
      if (request.method() === 'POST') {
        actionRequests.push(request.headers()['next-action'])
      }
    })

    await browser.elementByCss('#submit').click()

    await retry(async () => {
      expect(await browser.elementByCss('#form-state').text()).toBe(
        'Submitted 1 time(s) as Ada'
      )
    })

    expect(actionRequests).toHaveLength(1)
    expect(actionRequests[0]).toEqual(expect.any(String))
  })
})
