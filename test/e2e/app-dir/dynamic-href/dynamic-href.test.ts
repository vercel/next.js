import { nextTestSetup } from 'e2e-utils'

describe('dynamic-href', () => {
  const {
    isNextDev: isDev,
    next,
    skipped,
  } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  if (isDev) {
    it('should error when using dynamic href.pathname in app dir', async () => {
      const browser = await next.browser('/object')

      await expect(browser).toDisplayRedbox(`
       {
         "description": "Dynamic href \`/object/[slug]\` found in <Link> while using the \`/app\` router, this is not supported. Read more: https://nextjs.org/docs/messages/app-dir-dynamic-href",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "app/object/page.js (5:5) @ HomePage
       > 5 |     <Link
           |     ^",
         "stack": [
           "HomePage app/object/page.js (5:5)",
         ],
       }
      `)

      // Fix error
      const pageContent = await next.readFile('app/object/page.js')
      await next.patchFile(
        'app/object/page.js',
        pageContent.replace(
          "pathname: '/object/[slug]'",
          "pathname: '/object/slug'"
        )
      )
      expect(await browser.waitForElementByCss('#link').text()).toBe('to slug')

      // Navigate to new page
      await browser.elementByCss('#link').click()
      expect(await browser.waitForElementByCss('#pathname').text()).toBe(
        '/object/slug'
      )
      expect(await browser.elementByCss('#slug').text()).toBe('1')
    })

    it('should error when using dynamic href in app dir', async () => {
      const browser = await next.browser('/string')

      await expect(browser).toDisplayRedbox(`
       {
         "description": "Dynamic href \`/object/[slug]\` found in <Link> while using the \`/app\` router, this is not supported. Read more: https://nextjs.org/docs/messages/app-dir-dynamic-href",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "app/string/page.js (5:5) @ HomePage
       > 5 |     <Link id="link" href="/object/[slug]">
           |     ^",
         "stack": [
           "HomePage app/string/page.js (5:5)",
         ],
       }
      `)
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
})
