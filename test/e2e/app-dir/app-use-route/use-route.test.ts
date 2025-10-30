import { nextTestSetup, FileRef } from 'e2e-utils'
import { join } from 'path'

describe('useRoute() hook', () => {
  const { next } = nextTestSetup({
    files: {
      app: new FileRef(join(__dirname, 'app')),
    },
  })

  describe('Static Routes', () => {
    it('should return "/" for root page', async () => {
      const browser = await next.browser('/')
      const route = await browser.elementById('route').text()
      expect(route).toBe('/')
    })

    it('should return "/about" for simple static route', async () => {
      const browser = await next.browser('/about')
      const route = await browser.elementById('route').text()
      expect(route).toBe('/about')
    })

    it('should preserve route groups in canonical route', async () => {
      const browser = await next.browser('/settings')
      const route = await browser.elementById('route').text()
      expect(route).toBe('/(app)/(dashboard)/settings')
    })
  })

  describe('Dynamic Routes', () => {
    it('should return canonical route for dynamic parameter [slug]', async () => {
      const browser = await next.browser('/blog/my-post')
      const route = await browser.elementById('route').text()
      expect(route).toBe('/blog/[slug]')
    })

    it('should return canonical route for catch-all [...slug]', async () => {
      const browser = await next.browser('/docs/api/reference')
      const route = await browser.elementById('route').text()
      expect(route).toBe('/docs/[...slug]')
    })

    it('should return canonical route for optional catch-all [[...segments]]', async () => {
      const browser = await next.browser('/wiki/advanced/routing')
      const route = await browser.elementById('route').text()
      expect(route).toBe('/wiki/[[...segments]]')
    })

    it('should handle multiple dynamic parameters with route groups', async () => {
      const browser = await next.browser('/electronics/laptop')
      const route = await browser.elementById('route').text()
      expect(route).toBe('/(shop)/[category]/[product]')
    })
  })

  describe('Parallel Routes', () => {
    it('should show @modal parallel route when intercepting', async () => {
      const browser = await next.browser('/gallery')
      // Initially on the gallery page
      let route = await browser.elementById('route').text()
      expect(route).toBe('/gallery')

      // Click link to trigger interception
      await browser.elementById('link-to-photo').click()
      await browser.waitForElementByCss('[data-testid="gallery-modal-page"]')

      // Should show the intercepted route with @modal and (.) marker
      route = await browser.elementById('route').text()
      expect(route).toBe('/gallery/@modal/(group)/(.)[id]')

      await browser.refresh()
      await browser.waitForElementByCss('[data-testid="gallery-id-page"]')

      // Should show the canonical route
      route = await browser.elementById('route').text()
      expect(route).toBe('/gallery/[id]')
    })

    it('should show interception route with separate folder structure', async () => {
      const browser = await next.browser('/feed')
      // Initially on the feed page
      let route = await browser.elementById('route').text()
      expect(route).toBe('/feed')

      // Click link to trigger interception
      await browser.elementById('link-to-photo').click()
      await browser.waitForElementByCss('[data-testid="feed-modal-page"]')

      // Should show the intercepted route
      route = await browser.elementById('route').text()
      expect(route).toBe('/feed/@modal/(.)photo/[id]')
    })

    it('should handle nested parallel routes', async () => {
      const browser = await next.browser('/app/dashboard/stats/line')
      const route = await browser.elementById('route').text()
      expect(route).toBe('/app/dashboard/@panel/stats/@chart/line')
    })
  })

  describe('Navigation', () => {
    it('should update route when navigating between pages', async () => {
      const browser = await next.browser('/')

      // Start at root
      let route = await browser.elementById('route').text()
      expect(route).toBe('/')

      // Navigate to about
      await browser.elementById('link-about').click()
      await browser.waitForElementByCss('[data-testid="about-page"]')
      route = await browser.elementById('route').text()
      expect(route).toBe('/about')

      // Navigate back to home
      await browser.back()
      await browser.waitForElementByCss('[data-testid="root-page"]')
      route = await browser.elementById('route').text()
      expect(route).toBe('/')

      // Navigate to blog post
      await browser.elementById('link-blog-post').click()
      await browser.waitForElementByCss('[data-testid="blog-post-page"]')
      route = await browser.elementById('route').text()
      expect(route).toBe('/blog/[slug]')

      // Navigate back to home
      await browser.back()
      await browser.waitForElementByCss('[data-testid="root-page"]')
      route = await browser.elementById('route').text()
      expect(route).toBe('/')

      // Navigate to docs
      await browser.elementById('link-docs').click()
      await browser.waitForElementByCss('[data-testid="docs-page"]')
      route = await browser.elementById('route').text()
      expect(route).toBe('/docs/[...slug]')
    })

    it('should show correct route for client-side navigation', async () => {
      const browser = await next.browser('/')

      // Navigate via Link component
      await browser.elementById('link-settings').click()
      await browser.waitForElementByCss('[data-testid="settings-page"]')

      const route = await browser.elementById('route').text()
      expect(route).toBe('/(app)/(dashboard)/settings')
    })
  })

  describe('Comparison with usePathname()', () => {
    it('should differ from usePathname for dynamic routes', async () => {
      const browser = await next.browser('/blog/my-post')

      const pathname = await browser.elementById('pathname').text()
      const route = await browser.elementById('route').text()

      expect(pathname).toBe('/blog/my-post')
      expect(route).toBe('/blog/[slug]')
    })

    it('should differ from usePathname for route groups', async () => {
      const browser = await next.browser('/settings')

      const pathname = await browser.elementById('pathname').text()
      const route = await browser.elementById('route').text()

      // usePathname doesn't include route groups
      expect(pathname).toBe('/settings')
      // useRoute preserves route groups
      expect(route).toBe('/(app)/(dashboard)/settings')
    })

    it('should match usePathname for simple static routes', async () => {
      const browser = await next.browser('/about')

      const pathname = await browser.elementById('pathname').text()
      const route = await browser.elementById('route').text()

      expect(pathname).toBe('/about')
      expect(route).toBe('/about')
    })
  })
})
