import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'weird chars in scripts',
  {
    files: __dirname,
  },
  ({ next }) => {
    // TODO: fix test case in webpack
    // It's failing with `Could not find the module ".../app/client#component.tsx#" in the React Client Manifest. This is probably a bug in the React Server Components bundler.`
    ;(process.env.TURBOPACK ? it : it.skip)(
      'should load in the browser',
      async () => {
        const browser = await next.browser('/')
        expect(await browser.elementByCss('p').text()).toBe('hello world')
      }
    )
  }
)
