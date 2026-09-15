import { nextTestSetup } from 'e2e-utils'

describe('css-duplicate-preload', () => {
  const { next, isNextDev } = nextTestSetup({ files: __dirname })

  it('should use consistent precedence for dynamic CSS', async () => {
    const $ = await next.render$('/test')
    const cssLinks = $('link[rel="stylesheet"][data-precedence]')

    expect(cssLinks.length).toBeGreaterThan(0)

    const precedences = cssLinks
      .map((_, el) => $(el).attr('data-precedence'))
      .get()
      .filter(Boolean)

    const uniquePrecedences = [...new Set(precedences)]

    if (!isNextDev) {
      expect(uniquePrecedences).toEqual(['next'])
    } else {
      uniquePrecedences.forEach((p) => {
        expect(p).toMatch(/^next_/)
      })
    }
  })

  it('should not produce duplicate CSS link tags', async () => {
    const $ = await next.render$('/test')
    const cssLinks = $('link[rel="stylesheet"][data-precedence]')
    const hrefs = cssLinks
      .map((_, el) => $(el).attr('href'))
      .get()
      .filter(Boolean)

    expect(hrefs.length).toBe(new Set(hrefs).size)
  })

  it('should not duplicate when imported both statically and dynamically', async () => {
    const $ = await next.render$('/both')
    const cssLinks = $('link[rel="stylesheet"][data-precedence]')
    const hrefs = cssLinks
      .map((_, el) => $(el).attr('href'))
      .get()
      .filter(Boolean)

    expect(hrefs.length).toBe(new Set(hrefs).size)

    // At least one CSS file should be present for the shared stylesheet
    const cssHref = hrefs.find((h) => h.includes('.css'))
    expect(cssHref).toBeDefined()
  })

  it('should render dynamic component with styles applied', async () => {
    const browser = await next.browser('/test')
    const text = await browser.waitForElementByCss('.dynamic-text').text()
    expect(text).toBe('Dynamic Component with CSS')
  })
})
