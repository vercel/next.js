import { nextTestSetup } from 'e2e-utils'
import { NEXT_RSC_UNION_QUERY } from 'next/dist/client/components/app-router-headers'

describe('app dir - css - experimental inline css shared mode', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  ;(isNextDev ? describe.skip : describe)('Production only', () => {
    it('should inline Tailwind CSS from root layout in the initial HTML', async () => {
      const $ = await next.render$('/')

      // Tailwind CSS should be inlined in <style> tags
      // Check for Tailwind's characteristic patterns like utility classes
      const styleContent = $('style').text()
      // Tailwind generates CSS like .text-blue-500 { color: rgb(...) } or .bg-white { ... }
      expect(styleContent).toMatch(/\.text-blue-500|--tw-|\.bg-white/)
    })

    it('should apply Tailwind styles correctly', async () => {
      const browser = await next.browser('/')

      const h1 = await browser.elementByCss('h1')
      // text-blue-500 in Tailwind v3 is rgb(59, 130, 246)
      expect(await h1.getComputedCss('color')).toBe('rgb(59, 130, 246)')
    })

    it('should NOT include Tailwind CSS in RSC payload on navigation', async () => {
      // Fetch the RSC payload for page /a (navigation request)
      const rscPayload = await (
        await next.fetch(`/a?${NEXT_RSC_UNION_QUERY}`, {
          method: 'GET',
          headers: {
            rsc: '1',
          },
        })
      ).text()

      // Root layout (Tailwind) CSS content should NOT be in the RSC payload
      // because it was already inlined in the initial HTML
      expect(rscPayload).toContain('__PAGE__') // sanity check
      // Tailwind's characteristic patterns should NOT be present as inline content
      expect(rscPayload).not.toMatch(/--tw-text-opacity|\.text-blue-500\s*\{/)
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
      expect(rscPayload).toContain('__PAGE__') // sanity check
      // The page-specific CSS should be referenced (as link or stylesheet)
      expect(rscPayload).toMatch(/stylesheet|\.css/)
    })

    it('should render page-specific CSS as <link> tag on initial load', async () => {
      const $ = await next.render$('/a')

      // Tailwind CSS should still be inlined
      const styleContent = $('style').text()
      expect(styleContent).toMatch(/\.text-blue-500|--tw-|\.bg-white/)

      // Page-specific CSS (font-size:32px) should NOT be in the inline styles
      expect(styleContent).not.toMatch(/\.page-a-custom/)

      // Page-specific CSS should be loaded via <link> tag
      const linkTags = $('link[rel="stylesheet"]')
      expect(linkTags.length).toBeGreaterThan(0)
    })

    it('should not include Tailwind CSS content in RSC inline payload on initial HTML', async () => {
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

      // Tailwind CSS content should be in the HTML <style> tags
      const styleContent = $('style').text()
      expect(styleContent).toMatch(/\.text-blue-500|--tw-|\.bg-white/)

      // Tailwind CSS content should NOT be in the RSC payload
      // (The CSS is injected via ServerInsertedHTML, not the RSC tree)
      expect(rscPayload).not.toMatch(/--tw-text-opacity|\.text-blue-500\s*\{/)
    })

    it('should work correctly with client-side navigation', async () => {
      const browser = await next.browser('/')

      // Verify initial page has Tailwind styles
      const h1 = await browser.elementByCss('h1')
      expect(await h1.getComputedCss('color')).toBe('rgb(59, 130, 246)') // text-blue-500

      // Navigate to page A
      await browser.elementByCss('#link-a').click()
      await browser.waitForElementByCss('#page-a')

      // Tailwind styles should still work after navigation
      const h1AfterNav = await browser.elementByCss('h1')
      expect(await h1AfterNav.getComputedCss('color')).toBe('rgb(59, 130, 246)') // text-blue-500

      // Page A specific styles should also work
      const customElement = await browser.elementByCss('.page-a-custom')
      expect(await customElement.getComputedCss('fontSize')).toBe('32px')
      expect(await customElement.getComputedCss('color')).toBe('rgb(0, 128, 0)') // green
    })

    it('should maintain styles after multiple navigations', async () => {
      const browser = await next.browser('/')

      // Verify initial page
      expect(await browser.elementByCss('h1').getComputedCss('color')).toBe(
        'rgb(59, 130, 246)'
      )

      // Navigate: Home → A
      await browser.elementByCss('#link-a').click()
      await browser.waitForElementByCss('#page-a')
      expect(await browser.elementByCss('h1').getComputedCss('color')).toBe(
        'rgb(59, 130, 246)'
      )

      // Navigate: A → B
      await browser.elementByCss('#link-b').click()
      await browser.waitForElementByCss('#page-b')
      expect(await browser.elementByCss('h1').getComputedCss('color')).toBe(
        'rgb(59, 130, 246)'
      )
      // Page B specific styles
      expect(
        await browser.elementByCss('.page-b-custom').getComputedCss('color')
      ).toBe('rgb(128, 0, 128)') // purple

      // Navigate: B → Home
      await browser.elementByCss('#link-home').click()
      await browser.waitForElementByCss('#page-home')
      expect(await browser.elementByCss('h1').getComputedCss('color')).toBe(
        'rgb(59, 130, 246)'
      )
    })

    it('should only inline root layout CSS, not nested layout CSS', async () => {
      const $ = await next.render$('/nested')

      // Tailwind (root layout) CSS should be inlined
      const styleContent = $('style').text()
      expect(styleContent).toMatch(/\.text-blue-500|--tw-|\.bg-white/)

      // Nested layout CSS should NOT be in the inline styles
      expect(styleContent).not.toContain('.nested-layout-wrapper')
      expect(styleContent).not.toContain('.nested-header')

      // Nested layout CSS should be loaded via <link> tag
      const linkTags = $('link[rel="stylesheet"]')
      expect(linkTags.length).toBeGreaterThan(0)
    })

    it('should include nested layout CSS in RSC payload for navigations', async () => {
      // Fetch the RSC payload for /nested (navigation request)
      const rscPayload = await (
        await next.fetch(`/nested?${NEXT_RSC_UNION_QUERY}`, {
          method: 'GET',
          headers: {
            rsc: '1',
          },
        })
      ).text()

      // Nested layout CSS should be referenced in the RSC payload
      expect(rscPayload).toContain('__PAGE__') // sanity check
      // The nested layout CSS should be referenced (as link or stylesheet)
      expect(rscPayload).toMatch(/stylesheet|\.css/)
    })
  })
})
