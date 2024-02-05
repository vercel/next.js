import { createNextDescribe } from 'e2e-utils'
import { check } from 'next-test-utils'
import { FileRef } from 'e2e-utils'
import path from 'path'

createNextDescribe(
  'interception route groups (with default)',
  {
    files: {
      app: new FileRef(path.join(__dirname, 'app')),
      'app/default.tsx': `
        export default function Default() {
          return <div>Default Children (Root)</div>
        }
      `,
    },
  },
  ({ next }) => {
    it("should render the root default when a route group doesn't have a default", async () => {
      const browser = await next.browser('/')

      await browser.elementByCss('[href="/photos/1"]').click()
      // this route was intercepted, so we should see the slot contain the page content
      await check(
        () => browser.elementById('slot').text(),
        /Intercepted Photo Page 1/
      )

      // and the children slot should be whatever is specified by default (in this case, default is defined at the root of the app)
      await check(
        () => browser.elementById('children').text(),
        /Default Children \(Root\)/
      )

      await browser.refresh()

      // once we reload, the route is no longer intercepted. The slot will fallback to the default
      // and the children slot will be whatever is specified by the corresponding page component
      await check(() => browser.elementById('slot').text(), /@slot default/)
      await check(
        () => browser.elementById('children').text(),
        /Photo Page \(non-intercepted\) 1/
      )

      await browser.elementByCss('[href="/"]').click()

      // perform the same checks as above, but with the other page
      await browser.elementByCss('[href="/photos/2"]').click()
      await check(
        () => browser.elementById('slot').text(),
        /Intercepted Photo Page 2/
      )
      await check(
        () => browser.elementById('children').text(),
        /Default Children \(Root\)/
      )

      await browser.refresh()

      await check(() => browser.elementById('slot').text(), /@slot default/)
      await check(
        () => browser.elementById('children').text(),
        /Photo Page \(non-intercepted\) 2/
      )
    })

    it('should work when nested a level deeper', async () => {
      const browser = await next.browser('/nested')
      await browser.elementByCss('[href="/nested/photos/1"]').click()

      // this route was intercepted, so we should see the slot contain the page content
      await check(
        () => browser.elementById('slot').text(),
        /Intercepted Photo Page 1/
      )

      // and the children slot should be whatever is specified by default (in this case, default is defined at `/nested/default`)
      await check(
        () => browser.elementById('children').text(),
        /Default Children \(nested\)/
      )

      await browser.refresh()

      // once we reload, the route is no longer intercepted. The slot will fallback to the default
      // and the children slot will be whatever is specified by the corresponding page component
      await check(
        () => browser.elementById('slot').text(),
        /@intercepted default/
      )
      await check(
        () => browser.elementById('children').text(),
        /Photo Page \(non-intercepted\) 1/
      )

      await browser.elementByCss('[href="/nested"]').click()

      // perform the same checks as above, but with the other page
      await browser.elementByCss('[href="/nested/photos/2"]').click()
      await check(
        () => browser.elementById('slot').text(),
        /Intercepted Photo Page 2/
      )
      await check(
        () => browser.elementById('children').text(),
        /Default Children \(nested\)/
      )

      await browser.refresh()

      await check(
        () => browser.elementById('slot').text(),
        /@intercepted default/
      )
      await check(
        () => browser.elementById('children').text(),
        /Photo Page \(non-intercepted\) 2/
      )
    })
  }
)

createNextDescribe(
  'interception route groups (no default)',
  {
    files: {
      app: new FileRef(path.join(__dirname, 'app')),
    },
  },
  ({ next }) => {
    it('should use the default fallback (a 404) if there is no custom default page', async () => {
      const browser = await next.browser('/')

      await browser.elementByCss('[href="/photos/1"]').click()
      await check(() => browser.elementByCss('body').text(), /404/)
    })
  }
)
