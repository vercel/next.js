/* eslint-env jest */
import { nextTestSetup } from 'e2e-utils'
import { assertNoRedbox } from 'next-test-utils'

describe('app-dir - async-client-component', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('app router client component async module', async () => {
    const browser = await next.browser('/client')

    // There is no stack since this error is issued from the owner
    // which is a Next.js Component.
    // Ideally, it would be issued from the async Component instead but that's
    // harder to implement.
    await expect(browser).toDisplayCollapsedRedbox(`
     [
       {
         "description": "<Page> is an async Client Component. Only Server Components can be async at the moment. This error is often caused by accidentally adding \`'use client'\` to a module that was originally written for the server.",
         "environmentLabel": null,
         "label": "Console Error",
         "source": null,
         "stack": [],
       },
       {
         "description": "A component was suspended by an uncached promise. Creating promises inside a Client Component or hook is not yet supported, except via a Suspense-compatible library or framework.",
         "environmentLabel": null,
         "label": "Console Error",
         "source": null,
         "stack": [],
       },
     ]
    `)
  })

  it('app router server component async module', async () => {
    const browser = await next.browser('/server')

    await assertNoRedbox(browser)

    expect(await browser.elementByCss('#app-router-value').text()).toBe('hello')
  })
})
