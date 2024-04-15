import { createNextDescribe } from 'e2e-utils'

const GENERIC_RSC_ERROR =
  'An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.'

export function runTest({ next, isNextDev }) {
  it('should error when passing process env to client component', async () => {
    const browser = await next.browser('/')
    expect(await browser.waitForElementByCss('#error-component').text()).toBe(
      isNextDev
        ? 'Do not pass process.env to client components since it will leak sensitive data'
        : GENERIC_RSC_ERROR
    )
  })
}

createNextDescribe(
  'app dir - taint',
  {
    files: __dirname,
  },
  ({ next, isNextDev }) => {
    runTest({ next, isNextDev })
  }
)
