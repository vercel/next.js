import { nextTestSetup } from 'e2e-utils'
import { NEXT_RSC_UNION_QUERY } from 'next/dist/client/components/app-router-headers'
describe('app dir - css - experimental inline css', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  ;(isNextDev ? describe.skip : describe)('Production only', () => {
    it('should render page with correct styles', async () => {
      const browser = await next.browser('/')

      const inlineStyleTag = await browser.elementByCss('style')
      expect(await inlineStyleTag.text()).toContain('color')

      const p = await browser.elementByCss('p')
      expect(await p.getComputedCss('color')).toBe('rgb(255, 255, 0)') // yellow
    })

    it('should not return rsc payload with inlined style as a dynamic client nav', async () => {
      const rscPayload = await (
        await next.fetch(`/a?${NEXT_RSC_UNION_QUERY}`, {
          method: 'GET',
          headers: {
            rsc: '1',
          },
        })
      ).text()

      const style = 'font-size'

      expect(rscPayload).toContain('__PAGE__') // sanity check
      expect(rscPayload).not.toContain(style)

      expect(
        await (
          await next.fetch(`/a?${NEXT_RSC_UNION_QUERY}`, {
            method: 'GET',
          })
        ).text()
      ).toContain(style) // sanity check that HTML has the style
    })

    it('should have only one style tag when navigating from page with inlining to page without inlining', async () => {
      const browser = await next.browser('/')

      await browser.waitForElementByCss('#link-b').click()
      await browser.waitForElementByCss('#page-b')

      const styleTags = await browser.elementsByCss('style')
      const linkTags = await browser.elementsByCss('link[rel="stylesheet"]')

      expect(styleTags).toHaveLength(1)
      expect(linkTags).toHaveLength(0)
    })
  })
})
