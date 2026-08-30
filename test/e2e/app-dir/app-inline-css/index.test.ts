import { nextTestSetup } from 'e2e-utils'
import { NEXT_RSC_UNION_QUERY } from 'next/dist/client/components/app-router-headers'

const INLINE_CSS_MARKER = '--inline-css-marker-98079'

function countOccurrences(haystack: string, needle: string) {
  if (!needle) return 0
  return haystack.split(needle).length - 1
}

describe('app dir - css - experimental inline css', () => {
  const { next, isNextDev, isNextDeploy } = nextTestSetup({
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

    it('should inline the stylesheet once in the flight payload', async () => {
      const html = await next.render('/')
      const counts: Record<string, number> = {
        html: countOccurrences(html, INLINE_CSS_MARKER),
      }

      if (!isNextDeploy) {
        const rsc = await next.readFile('.next/server/app/index.rsc')
        const fullSegment = await next.readFile(
          '.next/server/app/index.segments/_full.segment.rsc'
        )
        const indexSegment = await next.readFile(
          '.next/server/app/index.segments/_index.segment.rsc'
        )
        counts.rsc = countOccurrences(rsc, INLINE_CSS_MARKER)
        counts.fullSegment = countOccurrences(fullSegment, INLINE_CSS_MARKER)
        counts.indexSegment = countOccurrences(indexSegment, INLINE_CSS_MARKER)
      }

      // html: 1 <style> + 1 flight copy. rsc/_full/_index: the single flight copy.
      expect(counts).toEqual(
        isNextDeploy
          ? { html: 2 }
          : { html: 2, rsc: 1, fullSegment: 1, indexSegment: 1 }
      )
    })

    it('should apply font styles correctly via className', async () => {
      const browser = await next.browser('/')

      const fontElement = await browser.elementByCss('#with-font')
      const computedFontFamily = await fontElement.getComputedCss('fontFamily')

      expect(computedFontFamily).toBeTruthy()
      expect(computedFontFamily).not.toBe('Times')
    })

    it('should apply font styles correctly via CSS variable', async () => {
      const browser = await next.browser('/')

      const bodyElement = await browser.elementByCss('body')
      const computedFontFamily = await bodyElement.getComputedCss('fontFamily')

      expect(computedFontFamily).toBeTruthy()
      expect(computedFontFamily).not.toBe('Times')
    })

    it('should inline font-face with absolute src URL', async () => {
      const $ = await next.render$('/')

      const styleTag = $('style')
      expect(styleTag.length).toBeGreaterThan(0)

      const styleContent = styleTag.html()
      expect(styleContent).toMatch(/@font-face/)
      expect(styleContent).toMatch(/font-family/)

      const srcMatch = styleContent.match(/src:\s*url\(([^)]+)\)/)
      expect(srcMatch).toBeTruthy()

      const fontUrl = srcMatch[1].replace(/['"]/g, '')
      expect(fontUrl).toMatch(/^\//)

      const res = await next.fetch(fontUrl)
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('font')
    })
  })
})
