import { nextTestSetup } from 'e2e-utils'

const GENERIC_RSC_ERROR =
  'An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.'

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
