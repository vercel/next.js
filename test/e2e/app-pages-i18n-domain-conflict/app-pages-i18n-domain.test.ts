/**
 * Test for GitHub Issue #86048
 * https://github.com/vercel/next.js/issues/86048
 *
 * This test reproduces a bug where App Router routes return 404
 * when Pages Router i18n is configured with domain-based routing.
 *
 * Expected behavior:
 * - Pages Router routes should work with i18n domain configuration
 * - App Router routes should also work alongside Pages Router
 * - Middleware rewrites should apply correctly to App Router
 *
 * Actual behavior (bug):
 * - Pages Router routes work correctly
 * - App Router routes return 404 despite middleware rewrites
 */

import { nextTestSetup } from 'e2e-utils'

describe('app-pages-i18n-domain-conflict', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  describe('Pages Router with i18n domain configuration', () => {
    it('should serve Pages Router root for English domain', async () => {
      const res = await next.fetch('/', {
        headers: {
          host: 'en.example.local:3000',
        },
      })

      expect(res.status).toBe(200)
      const html = await res.text()
      expect(html).toContain('Pages Router Home')
      expect(html).toContain('en-US')
      expect(html).toContain('Welcome to the homepage')
    })

    it('should serve Pages Router root for Dutch domain', async () => {
      const res = await next.fetch('/', {
        headers: {
          host: 'nl.example.local:3000',
        },
      })

      expect(res.status).toBe(200)
      const html = await res.text()
      expect(html).toContain('Pages Router Home')
      expect(html).toContain('nl-NL')
      expect(html).toContain('Welkom op de homepagina')
    })
  })

  describe('App Router with i18n domain configuration (FAILING)', () => {
    // This test should pass but currently fails due to the bug
    it('should serve App Router /test page for English domain', async () => {
      const res = await next.fetch('/test', {
        headers: {
          host: 'en.example.local:3000',
        },
      })

      // Currently returns 404 due to the bug
      // Expected: 200
      // Actual: 404
      expect(res.status).toBe(200)

      const html = await res.text()
      expect(html).toContain('App Router Test Page')
      expect(html).toContain('en-US')
      expect(html).toContain('This is the English version')
    })

    // This test should pass but currently fails due to the bug
    it('should serve App Router /test page for Dutch domain', async () => {
      const res = await next.fetch('/test', {
        headers: {
          host: 'nl.example.local:3000',
        },
      })

      // Currently returns 404 due to the bug
      // Expected: 200
      // Actual: 404
      expect(res.status).toBe(200)

      const html = await res.text()
      expect(html).toContain('App Router Test Page')
      expect(html).toContain('nl-NL')
      expect(html).toContain('Dit is de Nederlandse versie')
    })

    it('should handle middleware rewrites correctly', async () => {
      // Test that middleware is running and rewriting paths
      // even though the final route resolution fails
      const res = await next.fetch('/test', {
        headers: {
          host: 'nl.example.local:3000',
        },
      })

      // The middleware should rewrite /test -> /nl-NL/test
      // but the route still returns 404
      expect(res.status).toBe(200) // Should be 200, currently 404
    })
  })

  describe('Direct locale-prefixed URLs', () => {
    // Note: Direct locale-prefixed URLs still don't work due to i18n config
    // stripping the prefix even for direct access. This is a separate issue
    // from middleware rewrites. These tests document the current behavior.
    it('direct /en-US/test returns 404 (known limitation)', async () => {
      const res = await next.fetch('/en-US/test', {
        headers: {
          host: 'en.example.local:3000',
        },
      })

      // Currently returns 404 because i18n config strips locale prefix
      // even for direct URL access to App Router routes
      expect(res.status).toBe(404)
    })

    it('direct /nl-NL/test returns 404 (known limitation)', async () => {
      const res = await next.fetch('/nl-NL/test', {
        headers: {
          host: 'nl.example.local:3000',
        },
      })

      // Currently returns 404 because i18n config strips locale prefix
      // even for direct URL access to App Router routes
      expect(res.status).toBe(404)
    })
  })

  if (isNextDev) {
    describe('Development mode specific tests', () => {
      it('should log middleware rewrite in console', async () => {
        // In dev mode, we should see the middleware log
        await next.fetch('/test', {
          headers: {
            host: 'nl.example.local:3000',
          },
        })

        // Check that middleware executed (logged the rewrite)
        // await retry(() => {
        //   expect(next.cliOutput).toContain('[Middleware] Rewriting /test -> /nl-NL/test')
        // })
      })
    })
  }
})
