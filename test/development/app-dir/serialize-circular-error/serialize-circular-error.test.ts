import { nextTestSetup } from 'e2e-utils'
import {
  assertNoRedbox,
  assertHasRedbox,
  getRedboxDescription,
} from 'next-test-utils'

describe('serialize-circular-error', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should serialize the object from server component in console correctly', async () => {
    const browser = await next.browser('/')
    await assertHasRedbox(browser)

    const description = await getRedboxDescription(browser)
    // React cannot serialize thrown objects with circular references
    expect(description).toBe(
      '[ Server ] Error: An error occurred but serializing the error message failed.'
    )

    const output = next.cliOutput
    expect(output).toContain(
      'Error: {"objA":{"other":{"a":"[Circular]"}},"objB":"[Circular]"}'
    )
  })

  it('should serialize the object from client component in console correctly', async () => {
    const browser = await next.browser('/client')

    // It's not a valid error object, it will display the global-error instead of the error overlay
    // TODO: handle the error object in the client-side
    await assertNoRedbox(browser)

    const bodyText = await browser.elementByCss('body').text()
    expect(bodyText).toContain(
      'Application error: a client-side exception has occurred while loading localhost (see the browser console for more information).'
    )

    const output = next.cliOutput
    expect(output).toContain(
      'Error: {"objC":{"other":{"a":"[Circular]"}},"objD":"[Circular]"}'
    )
  })
})
