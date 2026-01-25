import { nextTestSetup } from 'e2e-utils'
import { NEXT_RSC_UNION_QUERY } from 'next/dist/client/components/app-router-headers'

describe('app dir - css - experimental inline css shared mode', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  ;(isNextDev ? describe.skip : describe)('Production only', () => {
    it('should inline root layout CSS in the initial HTML', async () => {
      const $ = await next.render$('/')

      // Root layout CSS should be inlined in <style> tags
      // Note: Turbopack minifies 'blue' to '#00f'
      const styleContent = $('style').text()
      expect(styleContent).toMatch(/color.*#00f|color.*blue/i)
    })

    it('should apply root layout styles correctly', async () => {
      const browser = await next.browser('/')

      const p = await browser.elementByCss('p')
      expect(await p.getComputedCss('color')).toBe('rgb(0, 0, 255)') // blue
    })

    it('should NOT include root layout CSS in RSC payload on navigation', async () => {
      // Fetch the RSC payload for page /a (navigation request)
      const rscPayload = await (
        await next.fetch(`/a?${NEXT_RSC_UNION_QUERY}`, {
          method: 'GET',
          headers: {
            rsc: '1',
          },
        })
      ).text()

      // Root layout CSS content should NOT be in the RSC payload
      // because it was already inlined in the initial HTML
      // Note: 404 error styling has 'color:#000' but that's not the root layout CSS
      expect(rscPayload).toContain('__PAGE__') // sanity check
      // The specific root layout CSS pattern (color:#00f or color:blue) should NOT be present
      // as inline content (but may be referenced as a <link>)
      expect(rscPayload).not.toMatch(/p\s*\{\s*color\s*:\s*(#00f|blue)/i)
    })

    it('should include page-specific CSS in RSC payload for navigations', async () => {
      // Fetch the RSC payload for page /a (navigation request)
      const rscPayload = await (
        await next.fetch(`/a?${NEXT_RSC_UNION_QUERY}`, {
          method: 'GET',
          headers: {
            rsc: '1',
          },
        })
      ).text()

      // Page A specific CSS should be in the RSC payload as a <link> reference
      // (not inlined, but referenced)
      expect(rscPayload).toContain('__PAGE__') // sanity check
      // The page-specific CSS should be referenced (as link or stylesheet)
      expect(rscPayload).toMatch(/stylesheet|\.css/)
    })

    it('should render page-specific CSS as <link> tag on initial load', async () => {
      const $ = await next.render$('/a')

      // Root layout CSS should still be inlined
      // Note: Turbopack minifies 'blue' to '#00f'
      const styleContent = $('style').text()
      expect(styleContent).toMatch(/color.*#00f|color.*blue/i)

      // Page-specific CSS (font-size:32px) should NOT be in the inline styles
      // It should be loaded via <link> tag instead
      expect(styleContent).not.toMatch(/font-size.*32px/i)

      // Page-specific CSS should be loaded via <link> tag
      const linkTags = $('link[rel="stylesheet"]')
      expect(linkTags.length).toBeGreaterThan(0)
    })

    it('should not include root layout CSS content in RSC inline payload on initial HTML', async () => {
      const $ = await next.render$('/')

      // Get the RSC inline payload from script tags
      const rscScripts = $('script')
        .filter(function () {
          const content = $(this).html()
          return content && content.includes('self.__next_f.push')
        })
        .toArray()

      // Combine all RSC payload content
      const rscPayload = rscScripts.map((script) => $(script).html()).join('\n')

      // CSS content should be in the HTML <style> tags
      // Note: Turbopack minifies 'blue' to '#00f'
      const styleContent = $('style').text()
      expect(styleContent).toMatch(/color.*#00f|color.*blue/i)

      // Root layout CSS content should NOT be in the RSC payload
      // (The CSS is injected via ServerInsertedHTML, not the RSC tree)
      expect(rscPayload).not.toMatch(/p\s*\{\s*color\s*:\s*(#00f|blue)/i)
    })

    it('should work correctly with client-side navigation', async () => {
      const browser = await next.browser('/')

      // Verify initial page has root layout styles
      const p = await browser.elementByCss('p')
      expect(await p.getComputedCss('color')).toBe('rgb(0, 0, 255)') // blue

      // Navigate to page A
      await browser.elementByCss('#link-a').click()
      await browser.waitForElementByCss('#page-a')

      // Root layout styles should still work after navigation
      const pAfterNav = await browser.elementByCss('p')
      expect(await pAfterNav.getComputedCss('color')).toBe('rgb(0, 0, 255)') // blue

      // Page A specific styles should also work
      const pageA = await browser.elementByCss('#page-a')
      expect(await pageA.getComputedCss('fontSize')).toBe('32px')
    })
  })
})
