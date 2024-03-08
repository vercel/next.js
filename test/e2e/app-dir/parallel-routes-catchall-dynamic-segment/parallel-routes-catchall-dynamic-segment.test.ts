import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'parallel-routes-catchall-dynamic-segment',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should match default and dynamic segment paths before catch-all', async () => {
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

      // we expect the slot0 to match since there's a page defined at this segment
      expect(await browser.elementById('slot0').text()).toBe(
        '/[locale]/nested/[foo]/[bar]/@slot0/page.tsx'
      )

      // we expect the slot1 to match since there's a page defined at this segment
      expect(await browser.elementById('slot1').text()).toBe(
        '/[locale]/nested/[foo]/[bar]/@slot1/page.tsx'
      )

      // we expect the slot2 to match since there's a default page defined at this segment
      expect(await browser.elementById('slot2').text()).toBe(
        '/[locale]/nested/[foo]/[bar]/@slot2/default.tsx'
      )

      browser = await next.browser('/en/nested/foo/bar/baz')

      // the page slot should still be the one matched at the /[foo]/[bar] segment because it's the default and we
      // didn't define a page at the /[foo]/[bar]/[baz] segment
      expect(await browser.elementById('nested-children').text()).toBe(
        '/[locale]/nested/[foo]/[bar]/default.tsx'
      )

      // we do have a slot for the `[baz]` dynamic segment in slot0 and so we expect that to match
      expect(await browser.elementById('slot0').text()).toBe(
        '/[locale]/nested/[foo]/[bar]/@slot0/[baz]/page.tsx'
      )

      // we do have a slot for the `[baz]` dynamic segment in slot1 and so we expect that to match
      expect(await browser.elementById('slot1').text()).toBe(
        '/[locale]/nested/[foo]/[bar]/@slot1/[baz]/page.tsx'
      )

      // we do not have a slot for the `[baz]` dynamic segment in slot2 and so the default page is matched
      expect(await browser.elementById('slot2').text()).toBe(
        '/[locale]/nested/[foo]/[bar]/@slot2/default.tsx'
      )

      browser = await next.browser('/en/nested/foo/bar/baz/qux')

      // the page slot should still be the one matched at the /[foo]/[bar] segment because it's the default and we
      // didn't define a page at the /[foo]/[bar]/[baz]/[qux] segment
      expect(await browser.elementById('nested-children').text()).toBe(
        '/[locale]/nested/[foo]/[bar]/default.tsx'
      )

      // we do not have a slot for the `[baz]/[qux]` dynamic segment in slot0 and so we expect the default page at `@slot0/` to be returned
      expect(await browser.elementById('slot0').text()).toBe(
        '/[locale]/nested/[foo]/[bar]/@slot0/default.tsx'
      )

      // we do have a slot for the `[baz]/[qux]` dynamic segment in slot1 and so we expect that to no match
      expect(await browser.elementById('slot1').text()).toBe(
        '/[locale]/nested/[foo]/[bar]/@slot1/[baz]/[qux]/page.tsx'
      )

      // we do not have a slot for the `[baz]/[qux]` dynamic segment in slot2 and so we expect the default page at `@slot2/` to be returned
      expect(await browser.elementById('slot2').text()).toBe(
        '/[locale]/nested/[foo]/[bar]/@slot2/default.tsx'
      )
    })
  }
)
