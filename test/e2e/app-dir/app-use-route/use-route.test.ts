import { nextTestSetup, FileRef } from 'e2e-utils'
import { join } from 'path'

describe('useRoutes() hook', () => {
  const { next } = nextTestSetup({
    files: {
      app: new FileRef(join(__dirname, 'app')),
    },
  })

  async function getRoutes(browser: any): Promise<string[]> {
    const text = await browser.elementById('routes').text()
    return JSON.parse(text)
  }

  describe('Static Routes', () => {
    it('should return ["/"] for root page', async () => {
      const browser = await next.browser('/')
      const routes = await getRoutes(browser)
      expect(routes).toEqual(['/'])
    })

    it('should return ["/about"] for simple static route', async () => {
      const browser = await next.browser('/about')
      const routes = await getRoutes(browser)
      expect(routes).toEqual(['/about'])
    })

    it('should preserve route groups in canonical route', async () => {
      const browser = await next.browser('/settings')
      const routes = await getRoutes(browser)
      expect(routes).toEqual(['/(app)/(dashboard)/settings'])
    })
  })

  describe('Dynamic Routes', () => {
    it('should return canonical route for dynamic parameter [slug]', async () => {
      const browser = await next.browser('/blog/my-post')
      const routes = await getRoutes(browser)
      expect(routes).toEqual(['/blog/[slug]'])
    })

    it('should return canonical route for catch-all [...slug]', async () => {
      const browser = await next.browser('/docs/api/reference')
      const routes = await getRoutes(browser)
      expect(routes).toEqual(['/docs/[...slug]'])
    })

    it('should return canonical route for optional catch-all [[...segments]]', async () => {
      const browser = await next.browser('/wiki/advanced/routing')
      const routes = await getRoutes(browser)
      expect(routes).toEqual(['/wiki/[[...segments]]'])
    })

    it('should handle multiple dynamic parameters with route groups', async () => {
      const browser = await next.browser('/electronics/laptop')
      const routes = await getRoutes(browser)
      expect(routes).toEqual(['/(shop)/[category]/[product]'])
    })
  })

  describe('Parallel Routes', () => {
    it('should show @modal parallel route when intercepting', async () => {
      const browser = await next.browser('/gallery')
      // Initially on the gallery page
      let routes = await getRoutes(browser)
      expect(routes).toEqual(['/gallery'])

      // Click link to trigger interception
      await browser.elementById('link-to-photo').click()
      await browser.waitForElementByCss('[data-testid="gallery-modal-page"]')

      // Should show the intercepted route with @modal and (.) marker
      routes = await getRoutes(browser)
      expect(routes).toEqual(['/gallery/@modal/(group)/(.)[id]'])

      await browser.refresh()
      await browser.waitForElementByCss('[data-testid="gallery-id-page"]')

      // Should show the canonical route
      routes = await getRoutes(browser)
      expect(routes).toEqual(['/gallery/[id]'])
    })

    it('should show interception route with separate folder structure', async () => {
      const browser = await next.browser('/feed')
      // Initially on the feed page
      let routes = await getRoutes(browser)
      expect(routes).toEqual(['/feed'])

      // Click link to trigger interception
      await browser.elementById('link-to-photo').click()
      await browser.waitForElementByCss('[data-testid="feed-modal-page"]')

      // Should show the intercepted route
      routes = await getRoutes(browser)
      expect(routes).toEqual(['/feed/@modal/(.)photo/[id]'])
    })

    it('should handle nested parallel routes', async () => {
      const browser = await next.browser('/app/dashboard/stats/line')
      const routes = await getRoutes(browser)
      expect(routes).toEqual(['/app/dashboard/@panel/stats/@chart/line'])
    })
  })

  describe('Navigation', () => {
    it('should update routes when navigating between pages', async () => {
      const browser = await next.browser('/')

      // Start at root
      let routes = await getRoutes(browser)
      expect(routes).toEqual(['/'])

      // Navigate to about
      await browser.elementById('link-about').click()
      await browser.waitForElementByCss('[data-testid="about-page"]')
      routes = await getRoutes(browser)
      expect(routes).toEqual(['/about'])

      // Navigate back to home
      await browser.back()
      await browser.waitForElementByCss('[data-testid="root-page"]')
      routes = await getRoutes(browser)
      expect(routes).toEqual(['/'])

      // Navigate to blog post
      await browser.elementById('link-blog-post').click()
      await browser.waitForElementByCss('[data-testid="blog-post-page"]')
      routes = await getRoutes(browser)
      expect(routes).toEqual(['/blog/[slug]'])

      // Navigate back to home
      await browser.back()
      await browser.waitForElementByCss('[data-testid="root-page"]')
      routes = await getRoutes(browser)
      expect(routes).toEqual(['/'])

      // Navigate to docs
      await browser.elementById('link-docs').click()
      await browser.waitForElementByCss('[data-testid="docs-page"]')
      routes = await getRoutes(browser)
      expect(routes).toEqual(['/docs/[...slug]'])
    })

    it('should show correct routes for client-side navigation', async () => {
      const browser = await next.browser('/')

      // Navigate via Link component
      await browser.elementById('link-settings').click()
      await browser.waitForElementByCss('[data-testid="settings-page"]')

      const routes = await getRoutes(browser)
      expect(routes).toEqual(['/(app)/(dashboard)/settings'])
    })
  })

  describe('Comparison with usePathname()', () => {
    it('should differ from usePathname for dynamic routes', async () => {
      const browser = await next.browser('/blog/my-post')

      const pathname = await browser.elementById('pathname').text()
      const routes = await getRoutes(browser)

      expect(pathname).toBe('/blog/my-post')
      expect(routes).toEqual(['/blog/[slug]'])
    })

    it('should differ from usePathname for route groups', async () => {
      const browser = await next.browser('/settings')

      const pathname = await browser.elementById('pathname').text()
      const routes = await getRoutes(browser)

      // usePathname doesn't include route groups
      expect(pathname).toBe('/settings')
      // useRoutes preserves route groups
      expect(routes).toEqual(['/(app)/(dashboard)/settings'])
    })

    it('should match usePathname for simple static routes', async () => {
      const browser = await next.browser('/about')

      const pathname = await browser.elementById('pathname').text()
      const routes = await getRoutes(browser)

      expect(pathname).toBe('/about')
      expect(routes).toEqual(['/about'])
    })
  })
})
