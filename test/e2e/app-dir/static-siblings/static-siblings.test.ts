/**
 * Static Siblings Tests
 *
 * When a dynamic route like /products/[id] exists alongside a static route
 * like /products/sale at the same URL level, these are called "static
 * siblings." The static route should always take precedence when navigating
 * to its exact URL.
 *
 * Test approach:
 * 1. RSC payload tests (prod only): Verify that information about static
 *    siblings is included in the server response. Skipped in dev because
 *    webpack compiles routes on-demand and only knows about visited routes.
 *    (Turbopack doesn't have this limitation since it builds the full
 *    directory tree from the file system.)
 *    TODO: Replace with end-to-end tests once client behavior is implemented.
 *
 * 2. Navigation tests (dev and prod): Navigate to the dynamic route first,
 *    then go back and click the static sibling link (with prefetch={false}).
 *    Verify the static page renders correctly.
 *
 * The navigation flow ensures the client has seen the dynamic route before
 * attempting to navigate to the sibling. This simulates real-world usage
 * where a user might visit or prefetch a dynamic route, then later navigate
 * to a static sibling URL.
 */

import { nextTestSetup } from 'e2e-utils'
// TODO: These imports are only needed for the temporary RSC payload tests.
// Remove once client behavior is implemented.
import {
  NEXT_RSC_UNION_QUERY,
  RSC_HEADER,
} from 'next/dist/client/components/app-router-headers'

describe('static-siblings', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  // TODO: This helper is only needed for the temporary RSC payload tests.
  // Remove once client behavior is implemented.
  async function fetchRscResponse(url: string): Promise<string> {
    const response = await next.fetch(`${url}?${NEXT_RSC_UNION_QUERY}`, {
      headers: {
        [RSC_HEADER]: '1',
      },
    })
    return response.text()
  }

  // RSC payload tests are skipped in dev because with webpack, routes are
  // compiled on-demand, so sibling information may not be available until all
  // routes have been visited. (Turbopack doesn't have this limitation.)
  describe('cross-route-group siblings', () => {
    // TODO: Replace with end-to-end test once client behavior is implemented
    if (!isNextDev) {
      it('should include static sibling info in the server response', async () => {
        // The static sibling 'sale' is in a different route group than [id]
        const rscPayload = await fetchRscResponse('/products/123')
        expect(rscPayload).toContain('"sale"')
      })
    }

    it('should navigate to static sibling after visiting dynamic route', async () => {
      const browser = await next.browser('/')

      // Step 1: Navigate to the dynamic route first to "discover" it
      const accordion = await browser.elementByCss(
        'input[data-link-accordion="/products/123"]'
      )
      await accordion.click()
      const dynamicLink = await browser.elementByCss('a[href="/products/123"]')
      await dynamicLink.click()

      // Verify we're on the dynamic route
      const dynamicText = await browser.elementByCss('#product-page').text()
      expect(dynamicText).toBe('Product page (dynamic route)')

      // Step 2: Navigate back to the home page
      await browser.back()
      await browser.elementByCss('#home-page')

      // Step 3: Navigate to the static sibling with prefetch={false}
      const staticLink = await browser.elementByCss('#link-to-sale')
      await staticLink.click()

      // Verify the static sibling page rendered
      const staticText = await browser.elementByCss('#sale-page').text()
      expect(staticText).toBe('Sale page (static sibling)')
    })
  })

  describe('same-directory siblings', () => {
    // TODO: Replace with end-to-end test once client behavior is implemented
    if (!isNextDev) {
      it('should include static sibling info in the server response', async () => {
        // The static sibling 'featured' is in the same directory as [id]
        const rscPayload = await fetchRscResponse('/items/123')
        expect(rscPayload).toContain('"featured"')
      })
    }

    it('should navigate to static sibling after visiting dynamic route', async () => {
      const browser = await next.browser('/')

      // Step 1: Navigate to the dynamic route first to "discover" it
      const accordion = await browser.elementByCss(
        'input[data-link-accordion="/items/456"]'
      )
      await accordion.click()
      const dynamicLink = await browser.elementByCss('a[href="/items/456"]')
      await dynamicLink.click()

      // Verify we're on the dynamic route
      const dynamicText = await browser.elementByCss('#item-page').text()
      expect(dynamicText).toBe('Item page (dynamic route)')

      // Step 2: Navigate back to the home page
      await browser.back()
      await browser.elementByCss('#home-page')

      // Step 3: Navigate to the static sibling with prefetch={false}
      const staticLink = await browser.elementByCss('#link-to-featured')
      await staticLink.click()

      // Verify the static sibling page rendered
      const staticText = await browser.elementByCss('#featured-page').text()
      expect(staticText).toBe('Featured items (static sibling)')
    })
  })

  describe('parallel route siblings', () => {
    // TODO: Replace with end-to-end test once client behavior is implemented
    if (!isNextDev) {
      it('should include static sibling info in the server response', async () => {
        // The static sibling 'settings' is in a parallel route slot
        const rscPayload = await fetchRscResponse('/dashboard/123')
        expect(rscPayload).toContain('"settings"')
      })
    }

    it('should navigate to static sibling after visiting dynamic route', async () => {
      const browser = await next.browser('/')

      // Step 1: Navigate to the dynamic route first to "discover" it
      const accordion = await browser.elementByCss(
        'input[data-link-accordion="/dashboard/789"]'
      )
      await accordion.click()
      const dynamicLink = await browser.elementByCss('a[href="/dashboard/789"]')
      await dynamicLink.click()

      // Verify we're on the dynamic route
      const dynamicText = await browser.elementByCss('#panel-item-page').text()
      expect(dynamicText).toBe('Panel item (dynamic in parallel route)')

      // Step 2: Navigate back to the home page
      await browser.back()
      await browser.elementByCss('#home-page')

      // Step 3: Navigate to the static sibling with prefetch={false}
      const staticLink = await browser.elementByCss('#link-to-settings')
      await staticLink.click()

      // Verify the static sibling page rendered
      const staticText = await browser
        .elementByCss('#panel-settings-page')
        .text()
      expect(staticText).toBe(
        'Panel settings (static sibling in parallel route)'
      )
    })
  })

  describe('deeply nested siblings', () => {
    // TODO: Replace with end-to-end test once client behavior is implemented
    if (!isNextDev) {
      it('should include static sibling info in the server response', async () => {
        // The static sibling 'electronics' is deeply nested with multiple layouts
        const rscPayload = await fetchRscResponse('/categories/phones')
        expect(rscPayload).toContain('"electronics"')
        // Nested segments inside 'electronics' should NOT be leaked as siblings
        expect(rscPayload).not.toContain('"computers"')
        expect(rscPayload).not.toContain('"laptops"')
      })
    }

    it('should navigate to static sibling after visiting dynamic route', async () => {
      const browser = await next.browser('/')

      // Step 1: Navigate to the dynamic route first to "discover" it
      const accordion = await browser.elementByCss(
        'input[data-link-accordion="/categories/phones"]'
      )
      await accordion.click()
      const dynamicLink = await browser.elementByCss(
        'a[href="/categories/phones"]'
      )
      await dynamicLink.click()

      // Verify we're on the dynamic route
      const dynamicText = await browser.elementByCss('#category-page').text()
      expect(dynamicText).toContain('Dynamic category page')

      // Step 2: Navigate back to the home page
      await browser.back()
      await browser.elementByCss('#home-page')

      // Step 3: Navigate to the deeply nested static sibling with prefetch={false}
      const staticLink = await browser.elementByCss('#link-to-laptops')
      await staticLink.click()

      // Verify the static sibling page rendered with all its layouts
      const staticText = await browser.elementByCss('#laptops-page').text()
      expect(staticText).toContain('Laptops')

      // Verify the nested layouts are present
      const electronicsLayout = await browser.elementByCss(
        '[data-electronics-layout]'
      )
      expect(electronicsLayout).toBeTruthy()
      const computersLayout = await browser.elementByCss(
        '[data-computers-layout]'
      )
      expect(computersLayout).toBeTruthy()
      const laptopsLayout = await browser.elementByCss('[data-laptops-layout]')
      expect(laptopsLayout).toBeTruthy()
    })
  })
})
