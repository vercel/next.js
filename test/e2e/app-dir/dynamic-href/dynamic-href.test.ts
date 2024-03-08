import { createNextDescribe } from 'e2e-utils'
import { getRedboxDescription, hasRedbox } from 'next-test-utils'

createNextDescribe(
  'dynamic-href',
  {
    files: __dirname,
    skipDeployment: true,
  },
  ({ isNextDev: isDev, next }) => {
    if (isDev) {
      it('should error when using dynamic href.pathname in app dir', async () => {
        const browser = await next.browser('/object')

        // Error should show up
        expect(await hasRedbox(browser)).toBeTrue()
        expect(await getRedboxDescription(browser)).toMatchInlineSnapshot(
          `"Error: Dynamic href \`/object/[slug]\` found in <Link> while using the \`/app\` router, this is not supported. Read more: https://nextjs.org/docs/messages/app-dir-dynamic-href"`
        )

        // Fix error
        const pageContent = await next.readFile('app/object/page.js')
        await next.patchFile(
          'app/object/page.js',
          pageContent.replace(
            "pathname: '/object/[slug]'",
            "pathname: '/object/slug'"
          )
        )
        expect(await browser.waitForElementByCss('#link').text()).toBe(
          'to slug'
        )

        // Navigate to new page
        await browser.elementByCss('#link').click()
        expect(await browser.waitForElementByCss('#pathname').text()).toBe(
          '/object/slug'
        )
        expect(await browser.elementByCss('#slug').text()).toBe('1')
      })

      it('should error when using dynamic href in app dir', async () => {
        const browser = await next.browser('/string')

        // Error should show up
        expect(await hasRedbox(browser)).toBeTrue()
        expect(await getRedboxDescription(browser)).toMatchInlineSnapshot(
          `"Error: Dynamic href \`/object/[slug]\` found in <Link> while using the \`/app\` router, this is not supported. Read more: https://nextjs.org/docs/messages/app-dir-dynamic-href"`
        )
      })
    } else {
      it('should not error on /object in prod', async () => {
        const browser = await next.browser('/object')
        expect(await browser.elementByCss('#link').text()).toBe('to slug')
      })
      it('should not error on /string in prod', async () => {
        const browser = await next.browser('/string')
        expect(await browser.elementByCss('#link').text()).toBe('to slug')
      })
    }
  }
)
