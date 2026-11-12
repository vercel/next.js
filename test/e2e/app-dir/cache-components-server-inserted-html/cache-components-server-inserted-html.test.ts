import { nextTestSetup } from 'e2e-utils'

// With Cache Components a page is prerendered by more than one HTML render.
// The markup registered with useServerInsertedHTML must come from the render
// whose HTML is kept, not from every render.
describe('cache-components-server-inserted-html', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
  })

  const countInsertedHTML = (html: string) =>
    html.match(/<meta name="cc-inserted-html"/g)?.length ?? 0

  it.each([
    ['/inserted-html/static', 'static page'],
    ['/inserted-html/dynamic-import', 'lazy client component'],
    ['/inserted-html/async-module', 'slow module loaded'],
  ])(
    'inserts the markup of useServerInsertedHTML once on %s',
    async (pathname, content) => {
      if (isNextStart) {
        const prerendered = await next.readFile(
          `.next/server/app${pathname}.html`
        )
        expect(prerendered).toContain(content)
        expect(countInsertedHTML(prerendered)).toBe(1)
      }

      const html = await next.render(pathname)
      expect(html).toContain(content)
      expect(countInsertedHTML(html)).toBe(1)
    }
  )
})
