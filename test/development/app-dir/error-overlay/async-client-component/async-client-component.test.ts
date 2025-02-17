/* eslint-env jest */
import { nextTestSetup } from 'e2e-utils'
import {
  assertNoRedbox,
  getRedboxDescription,
  getStackFramesContent,
  openRedbox,
} from 'next-test-utils'

describe('app-dir - async-client-component', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('app router client component async module', async () => {
    const browser = await next.browser('/client')

    await openRedbox(browser)

    const description = await getRedboxDescription(browser)
    const componentStack = await getStackFramesContent(browser)
    const result = {
      description,
      componentStack,
    }

    // TODO(error): display component stack
    expect(result).toMatchInlineSnapshot(`
     {
       "componentStack": "",
       "description": "async/await is not yet supported in Client Components, only Server Components. This error is often caused by accidentally adding \`'use client'\` to a module that was originally written for the server.",
     }
    `)
  })

  it('app router server component async module', async () => {
    const browser = await next.browser('/server')

    await assertNoRedbox(browser)

    expect(await browser.elementByCss('#app-router-value').text()).toBe('hello')
  })
})
