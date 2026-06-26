import { join } from 'path'
import { nextTestSetup, type NextInstance } from 'e2e-utils'
import { retry } from 'next-test-utils'

// In dev the first request to a not-yet-registered dynamic route can return a
// transient 404 (a cold-start race, observed flaking in CI). Warm the route up
// with a direct request before driving the browser so the navigation is
// deterministic.
async function warmUpRoute(next: NextInstance, pathname: string) {
  await retry(async () => {
    const res = await next.fetch(pathname)
    expect(res.status).toBe(200)
  })
}

describe('pages-to-app-routing', () => {
  const { next } = nextTestSetup({
    files: join(__dirname, 'fixtures', 'default'),
  })

  it('should client-navigate from a pages route to an app route', async () => {
    await warmUpRoute(next, '/abc')

    const browser = await next.browser('/abc')
    expect(await browser.elementByCss('#params').text()).toBe(
      'Params: {"slug":"abc"}'
    )

    await browser
      .elementByCss('#to-about-link')
      .click()
      .waitForElementByCss('#app-page')

    expect(await browser.elementByCss('#app-page').text()).toBe('About')
  })
})

// Regression test for https://github.com/vercel/next.js/issues/74696.
//
// Route structure:
//   app/[locale]/about/page.tsx         -> App Router
//   pages/[locale]/some-page/index.tsx  -> Pages Router (start page)
//   pages/[locale]/[category]/index.tsx -> Pages Router (matches /en/about)
//
// `/en/about` matches the App Router page `app/[locale]/about`, and it is also
// matched by the Pages Router dynamic route `pages/[locale]/[category]`. The
// server pools app and pages routes and ranks them by specificity, so the
// static `about` segment beats the dynamic `[category]` and the App Router
// page wins (the same way `some-page` beats `[category]`). A client-side
// navigation from a Pages Router page must reach that same App Router page.
// Client-side, the Pages Router ranks only its own routes, so `[category]`
// shadows the app route; this test guards against that. A hard reload of the
// same URL always renders the App Router page.
//
// All three pages expose a `#page-title` element with distinct text, so the
// rendered route is asserted directly on that text.
describe('pages-to-app-routing with cross-router shadowing', () => {
  const { next } = nextTestSetup({
    files: join(__dirname, 'fixtures', 'cross-router-shadowing'),
  })

  it('should client-navigate to the app route, not the shadowing pages dynamic route', async () => {
    await warmUpRoute(next, '/en/some-page')

    const browser = await next.browser('/en/some-page')
    expect(await browser.elementByCss('#page-title').text()).toBe(
      'Pages Some Page: en'
    )

    await browser.elementByCss('#to-locale-about-link').click()

    // Wait until the navigation has committed (the URL reflects the target and
    // the title is no longer the start page). In dev the conflicting route is
    // compiled on demand, so this can take a few seconds.
    await retry(async () => {
      expect(await browser.url()).toContain('/en/about')
      expect(await browser.elementByCss('#page-title').text()).not.toBe(
        'Pages Some Page: en'
      )
    }, 15000)

    expect(await browser.elementByCss('#page-title').text()).toBe(
      'App About: en'
    )
  })

  it('should render the app route on a hard reload of the same URL', async () => {
    const browser = await next.browser('/en/about')

    expect(await browser.elementByCss('#page-title').text()).toBe(
      'App About: en'
    )
  })

  it('should still client-navigate to a real pages dynamic route (no spurious hard navigation)', async () => {
    const browser = await next.browser('/en/some-page')
    expect(await browser.elementByCss('#page-title').text()).toBe(
      'Pages Some Page: en'
    )

    await browser.elementByCss('#to-category-link').click()

    await retry(async () => {
      expect(await browser.url()).toContain('/en/products')
      expect(await browser.elementByCss('#page-title').text()).not.toBe(
        'Pages Some Page: en'
      )
    }, 15000)

    // `/en/products` is owned by the Pages Router `[category]` route, not an app
    // route, so the shadow check must not hijack it: the navigation should stay
    // in the Pages Router rather than hard-navigate.
    expect(await browser.elementByCss('#page-title').text()).toBe(
      'Pages Category: products (en)'
    )
  })
})

// The shadowing pages route can also be a catch-all. `/en` and `/en/about` are
// App Router pages (`app/[lang]` and `app/[lang]/about`), but a Pages Router
// catch-all matches them too. Because a catch-all absorbs a variable number of
// segments, the matched route has fewer segments than the concrete path, which
// the single-segment dynamic case does not exercise. The optional catch-all
// (`[[...slug]]`) additionally owns `/`.
const catchAllVariants = [
  { label: 'catch-all', dir: 'cross-router-shadowing-catch-all' },
  {
    label: 'optional catch-all',
    dir: 'cross-router-shadowing-optional-catch-all',
  },
]

for (const variant of catchAllVariants) {
  describe(`pages-to-app-routing with cross-router shadowing via a ${variant.label}`, () => {
    const { next } = nextTestSetup({
      files: join(__dirname, 'fixtures', variant.dir),
    })

    it('should client-navigate to a single-segment app route shadowed by the pages catch-all', async () => {
      await warmUpRoute(next, '/')

      const browser = await next.browser('/')
      expect(await browser.elementByCss('#page-title').text()).toBe(
        'Pages Home'
      )

      await browser.elementByCss('#to-lang-link').click()

      await retry(async () => {
        expect(await browser.url()).toContain('/en')
        expect(await browser.elementByCss('#page-title').text()).not.toBe(
          'Pages Home'
        )
      }, 15000)

      expect(await browser.elementByCss('#page-title').text()).toBe(
        'App Lang: en'
      )
    })

    it('should client-navigate to a multi-segment app route shadowed by the pages catch-all', async () => {
      const browser = await next.browser('/')
      expect(await browser.elementByCss('#page-title').text()).toBe(
        'Pages Home'
      )

      await browser.elementByCss('#to-lang-about-link').click()

      await retry(async () => {
        expect(await browser.url()).toContain('/en/about')
        expect(await browser.elementByCss('#page-title').text()).not.toBe(
          'Pages Home'
        )
      }, 15000)

      expect(await browser.elementByCss('#page-title').text()).toBe(
        'App About: en'
      )
    })
  })
}

// Under `basePath`, the concrete path carries the prefix (`/base/en/about`) but
// the filter stores app routes without it, so the check must strip the basePath
// before reconstructing candidates. This guards that alignment.
describe('pages-to-app-routing with cross-router shadowing under basePath', () => {
  const { next } = nextTestSetup({
    files: join(__dirname, 'fixtures', 'cross-router-shadowing-basepath'),
  })

  it('should client-navigate to the app route, not the shadowing pages dynamic route', async () => {
    await warmUpRoute(next, '/base/en/some-page')

    const browser = await next.browser('/base/en/some-page')
    expect(await browser.elementByCss('#page-title').text()).toBe(
      'Pages Some Page: en'
    )

    await browser.elementByCss('#to-locale-about-link').click()

    await retry(async () => {
      expect(await browser.url()).toContain('/base/en/about')
      expect(await browser.elementByCss('#page-title').text()).not.toBe(
        'Pages Some Page: en'
      )
    }, 15000)

    expect(await browser.elementByCss('#page-title').text()).toBe(
      'App About: en'
    )
  })
})
