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
//
// ```
//   app/[locale]/about/page.tsx         -> App Router
//   pages/[locale]/some-page/index.tsx  -> Pages Router (start page)
//   pages/[locale]/[category]/index.tsx -> Pages Router (matches /en/about)
// ```
//
// `/en/about` is served by the App Router page `app/[locale]/about` even though
// the Pages Router dynamic route `pages/[locale]/[category]` also matches it:
// the more specific static `about` segment wins, the same way `/en/some-page`
// is served by `some-page` rather than `[category]`. A hard reload of
// `/en/about` renders the App Router page. A client-side navigation to it from
// a Pages Router page must reach that same App Router page, not the Pages
// Router `[category]` route.
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

    // `/en/products` is owned by the Pages Router `[category]` route, not an
    // app route, so this navigation must stay a client-side navigation within
    // the Pages Router rather than hard-navigate.
    expect(await browser.elementByCss('#page-title').text()).toBe(
      'Pages Category: products (en)'
    )
  })
})

// The shadowing pages route can also be a catch-all. `/en` and `/en/about` are
// App Router pages (`app/[lang]` and `app/[lang]/about`), but a Pages Router
// catch-all matches them too. A catch-all absorbs a variable number of
// segments, so these variants exercise both a single-segment (`/en`) and a
// multi-segment (`/en/about`) target. The optional catch-all (`[[...slug]]`)
// additionally owns `/`.
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

// The same cross-router navigation must still reach the App Router page when
// the app is served under a `basePath`.
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

// A pages optional catch-all (`[[...slug]]`) owns `/` by absorbing zero
// segments, but a root-level dynamic app route (`app/[lang]`) does not own `/`
// (it requires one segment). Navigating to `/` from a Pages Router page must
// therefore stay a client-side navigation and must not hard-navigate to the App
// Router. The page renders correctly either way (the server owns `/`), so the
// hard navigation is detected from the document request rather than the
// rendered text.
describe('pages-to-app-routing with a pages optional catch-all owning the root', () => {
  const { next, isNextDev } = nextTestSetup({
    files: join(
      __dirname,
      'fixtures',
      'cross-router-shadowing-optional-catch-all'
    ),
  })

  // Production only: in dev, navigating to the optional catch-all index `/`
  // always hard-navigates because its data response 404s and the Pages Router
  // falls back to a full reload, which would mask what this test verifies. That
  // dev-only 404 is a separate pre-existing issue.
  const skipInDev = isNextDev ? it.skip : it

  skipInDev(
    'should client-navigate to the root without a hard navigation',
    async () => {
      // A two-segment path no app route matches, so it is owned by the pages
      // optional catch-all (a one-segment path like `/start` would be the app
      // `/[lang]` route instead).
      const browser = await next.browser('/start/here')
      // eslint-disable-next-line jest/no-standalone-expect
      expect(await browser.elementByCss('#page-title').text()).toBe(
        'Pages Optional Catchall: start/here'
      )

      let didHardNavigateToRoot = false
      browser.on('request', (req) => {
        if (req.isNavigationRequest() && new URL(req.url()).pathname === '/') {
          didHardNavigateToRoot = true
        }
      })

      await browser.elementByCss('#to-home-link').click()

      await retry(async () => {
        expect(await browser.elementByCss('#page-title').text()).toBe(
          'Pages Home'
        )
      }, 15000)

      // eslint-disable-next-line jest/no-standalone-expect
      expect(didHardNavigateToRoot).toBe(false)
    }
  )
})
