import { nextTestSetup } from 'e2e-utils'

describe('File Dependencies', () => {
  describe('production mode', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      skipDeployment: true,
    })
    if (skipped) return

    it('should apply styles defined in global and module css files in a standard page.', async () => {
      const browser = await next.browser('/')
      await browser.elementByCss('#index')

      const styles = await browser.eval(() => {
        const computed = getComputedStyle(
          document.getElementById('index') as HTMLElement
        )
        return {
          color: computed.color,
          backgroundColor: computed.backgroundColor,
        }
      })

      expect(styles).toEqual({
        color: 'rgb(0, 0, 255)',
        backgroundColor: 'rgb(200, 200, 200)',
      })
    })

    it('should apply styles defined in global and module css files in 404 page', async () => {
      const browser = await next.browser('/__not_found__')
      await browser.elementByCss('#notFound')

      const styles = await browser.eval(() => {
        const computed = getComputedStyle(
          document.getElementById('notFound') as HTMLElement
        )
        return {
          color: computed.color,
          backgroundColor: computed.backgroundColor,
        }
      })

      expect(styles).toEqual({
        color: 'rgb(0, 255, 0)',
        backgroundColor: 'rgb(200, 200, 200)',
      })
    })

    it('should apply styles defined in global and module css files in error page', async () => {
      const browser = await next.browser('/error-trigger')
      await browser.elementByCss('#error')

      const styles = await browser.eval(() => {
        const computed = getComputedStyle(
          document.getElementById('error') as HTMLElement
        )
        return {
          color: computed.color,
          backgroundColor: computed.backgroundColor,
        }
      })

      expect(styles).toEqual({
        color: 'rgb(255, 0, 0)',
        backgroundColor: 'rgb(200, 200, 200)',
      })
    })
  })
})
