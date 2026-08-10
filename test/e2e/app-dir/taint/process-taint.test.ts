import { nextTestSetup } from 'e2e-utils'

const GENERIC_RSC_ERROR =
  'Minified React error #441; visit https://react.dev/errors/441 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.'

export function runTest({ next, isNextDev }) {
  it('should error when passing process env to client component', async () => {
    const browser = await next.browser('/')
    expect(await browser.waitForElementByCss('#error-component').text()).toBe(
      isNextDev
        ? 'Do not pass process.env to Client Components since it will leak sensitive data'
        : GENERIC_RSC_ERROR
    )
  })
}

describe('app dir - taint', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  runTest({ next, isNextDev })
})
