import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'parallel-routes-catchall-children-slot',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should match the @children slot for a page before attempting to match the catchall', async () => {
      let browser = await next.browser('/')
      await expect(browser.elementById('children').text()).resolves.toBe(
        'Hello from @children/page'
      )
      await expect(browser.elementById('slot').text()).resolves.toBe(
        '@slot content'
      )

      browser = await next.browser('/nested')

      await expect(browser.elementById('children').text()).resolves.toBe(
        'Hello from nested @children page'
      )
      await expect(browser.elementById('slot').text()).resolves.toBe(
        'Default @slot'
      )
    })
  }
)
