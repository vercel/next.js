import { nextTestSetup } from 'e2e-utils'

describe('css-chunking', () => {
  const { next } = nextTestSetup({ files: __dirname })

  // this test asserts that all the emitted CSS files for the index page
  // do not contain styles for the `/other` page, which can happen
  // when the CSSChunkingPlugin is enabled and styles are shared across
  // both routes.
  it('should be possible to disable the chunking plugin', async () => {
    const $ = await next.render$('/')
    const stylesheets = $('link[rel="stylesheet"]')
    stylesheets.each(async (_, element) => {
      const href = element.attribs.href
      const result = await next.fetch(href)
      const css = await result.text()

      expect(css).not.toContain('.otherPage')
    })
  })
})
