import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'parallel-routes-catchall-default',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should match default paths before catch-all', async () => {
      let browser = await next.browser('/en/nested')

      // we have a top-level catch-all but the /nested dir doesn't have a default/page until the /[foo]/[bar] segment
      // so we expect the top-level catch-all to render
      expect(await browser.elementById('children').text()).toBe(
        '/[locale]/[[...catchAll]]/page.tsx'
      )

      browser = await next.browser('/en/nested/foo/bar')

      // we're now at the /[foo]/[bar] segment, so we expect the matched page to be the default (since there's no page defined)
      expect(await browser.elementById('nested-children').text()).toBe(
        '/[locale]/nested/[foo]/[bar]/default.tsx'
      )

      // we expect the slot to match since there's a page defined at this segment
      expect(await browser.elementById('slot').text()).toBe(
        '/[locale]/nested/[foo]/[bar]/@slot/page.tsx'
      )

      browser = await next.browser('/en/nested/foo/bar/baz')

      // the page slot should still be the one matched at the /[foo]/[bar] segment because it's the default and we
      // didn't define a page at the /[foo]/[bar]/[baz] segment
      expect(await browser.elementById('nested-children').text()).toBe(
        '/[locale]/nested/[foo]/[bar]/default.tsx'
      )

      // however we do have a slot for the `[baz]` segment and so we expect that to match
      expect(await browser.elementById('slot').text()).toBe(
        '/[locale]/nested/[foo]/[bar]/@slot/[baz]/page.tsx'
      )
    })
  }
)
