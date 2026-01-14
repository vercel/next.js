import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'
import type { ClientReferenceManifest } from 'next/dist/build/webpack/plugins/flight-manifest-plugin'

describe('route-handler-manifest-size', () => {
  const { next, isNextStart, skipped } = nextTestSetup({
    files: __dirname,
    // This test is specifically for webpack behavior
    skipDeployment: true,
  })

  if (skipped) return

  /**
   * Loads and returns the client reference manifest for a given route
   */
  function getClientReferenceManifest(route: string): ClientReferenceManifest {
    const appDir = next.testDir
    const manifestPath = join(
      appDir,
      `.next/server/app${route}_client-reference-manifest.js`
    )
    const modulePath = require.resolve(manifestPath)

    // Clear any cached version
    delete require.cache[modulePath]

    // Initialize global if needed
    if (!(globalThis as any).__RSC_MANIFEST) {
      ;(globalThis as any).__RSC_MANIFEST = {}
    }

    // Load the manifest (it sets globalThis.__RSC_MANIFEST)
    require(modulePath)

    const manifest = (globalThis as any).__RSC_MANIFEST[
      route
    ] as ClientReferenceManifest

    // Clean up require cache but keep manifest for potential re-reads
    delete require.cache[modulePath]

    return manifest
  }

  /**
   * Gets the module paths from clientModules
   */
  function getClientModulePaths(manifest: ClientReferenceManifest): string[] {
    return Object.keys(manifest.clientModules)
  }

  if (isNextStart) {
    it('should not include page client components in pure route handler manifest', () => {
      const manifest = getClientReferenceManifest('/api/hello/route')
      const modulePaths = getClientModulePaths(manifest)

      // The pure route handler should NOT contain client components from the page
      const hasButton = modulePaths.some((p) => p.includes('Button'))
      const hasModal = modulePaths.some((p) => p.includes('Modal'))
      const hasDropdown = modulePaths.some((p) => p.includes('Dropdown'))

      expect(hasButton).toBe(false)
      expect(hasModal).toBe(false)
      expect(hasDropdown).toBe(false)
    })

    it('should include page client components in page manifest', () => {
      const manifest = getClientReferenceManifest('/page')
      const modulePaths = getClientModulePaths(manifest)

      // The page should contain its client components
      const hasButton = modulePaths.some((p) => p.includes('Button'))
      const hasModal = modulePaths.some((p) => p.includes('Modal'))
      const hasDropdown = modulePaths.some((p) => p.includes('Dropdown'))

      expect(hasButton).toBe(true)
      expect(hasModal).toBe(true)
      expect(hasDropdown).toBe(true)
    })

    it('should have significantly smaller manifest for pure route handler compared to page', () => {
      const routeManifest = getClientReferenceManifest('/api/hello/route')
      const pageManifest = getClientReferenceManifest('/page')

      const routeModuleCount = Object.keys(routeManifest.clientModules).length
      const pageModuleCount = Object.keys(pageManifest.clientModules).length

      // Route handler should have fewer client modules than the page
      // (ideally 0 for a pure route handler, but allowing some for internal modules)
      expect(routeModuleCount).toBeLessThan(pageModuleCount)
    })

    it('should not include page components in route handler that imports client module', () => {
      const manifest = getClientReferenceManifest('/api-with-client/route')
      const modulePaths = getClientModulePaths(manifest)

      // Route handler should NOT have unrelated client components from the page
      // (even if it imports its own client module)
      const hasButton = modulePaths.some((p) => p.includes('Button'))
      const hasModal = modulePaths.some((p) => p.includes('Modal'))
      const hasDropdown = modulePaths.some((p) => p.includes('Dropdown'))

      expect(hasButton).toBe(false)
      expect(hasModal).toBe(false)
      expect(hasDropdown).toBe(false)
    })
  }

  // Functional tests that work in both dev and production
  it('should respond correctly from pure route handler', async () => {
    const res = await next.fetch('/api/hello')
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.message).toBe('Hello from pure route handler')
  })

  it('should render page with client components', async () => {
    const browser = await next.browser('/')
    const heading = await browser.elementByCss('h1').text()
    expect(heading).toBe('Page with Client Components')
  })
})
