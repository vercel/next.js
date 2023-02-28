import { createNextDescribe } from 'e2e-utils'
import { check } from 'next-test-utils'

createNextDescribe(
  `app-dir-hmr`,
  {
    files: __dirname,
  },
  ({ next }) => {
    describe('filesystem changes', () => {
      it('should not break when renaming a folder', async () => {
        console.log(next.url)
        const browser = await next.browser('/folder')
        const text = await browser.elementByCss('h1').text()
        expect(text).toBe('Hello')

        // Rename folder
        await next.renameFolder('app/folder', 'app/folder-renamed')

        try {
          // Should be 404 in a few seconds
          await check(async () => {
            const body = await browser.elementByCss('body').text()
            expect(body).toContain('404')
            return 'success'
          }, 'success')

          // The new page should be rendered
          const newHTML = await next.render('/folder-renamed')
          expect(newHTML).toContain('Hello')
        } finally {
          // Rename it back
          await next.renameFolder('app/folder-renamed', 'app/folder')
        }
      })
    })
  }
)
