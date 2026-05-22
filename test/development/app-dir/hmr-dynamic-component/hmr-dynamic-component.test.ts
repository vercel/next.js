import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('hmr-dynamic-component', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    patchFileDelay: 500,
  })

  it('should update text in a dynamically-imported client component without a full reload', async () => {
    const browser = await next.browser('/')
    const componentPath = join('app', 'components', 'dynamic.tsx')
    const originalContent = await next.readFile(componentPath)
    try {
      await retry(async () => {
        const div = await browser.elementByCss('#dynamic-component')
        expect(await div.text()).toContain('Dynamic Component')
      })

      const timeOrigin = await browser.eval('performance.timeOrigin')

      const editedContent = originalContent.replace(
        'Dynamic Component',
        'Dynamic Component UPDATED'
      )

      await next.patchFile(componentPath, editedContent)

      await retry(async () => {
        const div = await browser.elementByCss('#dynamic-component')
        expect(await div.text()).toContain('Dynamic Component UPDATED')
      }, 10000)

      // Ensure the page was updated via HMR and not a full reload
      expect(await browser.eval('performance.timeOrigin')).toEqual(timeOrigin)
    } finally {
      await next.patchFile(componentPath, originalContent)
    }
  })
})
