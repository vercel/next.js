import path from 'path'
import fs from 'fs'
import { nextTestSetup } from 'e2e-utils'
import { recursiveReadDir } from 'next/dist/lib/recursive-readdir'
import { initializeNextInvariants } from 'next/dist/server/next-invariants'

describe('next-invariants', () => {
  const { next, isNextDev, isNextStart } = nextTestSetup({
    files: __dirname,
  })

  // Initialize invariants in the test process to get the canonical key set.
  // This is the source of truth — if a new key is added to NextInvariants,
  // it will appear here and the test will fail until a corresponding client
  // component file is created in app/invariants/.
  initializeNextInvariants(
    { trailingSlash: false, experimental: {} } as any,
    false
  )
  const invariantKeys = Object.keys(
    (globalThis as any).__NEXT_INVARIANTS__
  ).sort()

  it('should have a client component for every invariant key and no extras', () => {
    const invariantsDir = path.join(__dirname, 'app', 'invariants')
    const files = fs.readdirSync(invariantsDir)
    const componentKeys = files
      .filter((f) => f.endsWith('.tsx'))
      .map((f) => f.replace('.tsx', ''))
      .sort()

    expect(componentKeys).toEqual(invariantKeys)
  })

  // SSR verifies server-side rendering works for both component types.
  it('should SSR the replaced values in client components', async () => {
    const $ = await next.render$('/')
    expect($('#isDevServer').text()).toBe(String(isNextDev))
    expect($('#trailingSlash').text()).toBe('true')
    expect($('#experimentalOptimisticRouting').text()).toBe('true')
  })

  it('should SSR the replaced values in server components', async () => {
    const $ = await next.render$('/server')
    expect($('#server-isDevServer').text()).toBe(String(isNextDev))
    expect($('#server-trailingSlash').text()).toBe('true')
    expect($('#server-experimentalOptimisticRouting').text()).toBe('true')
  })

  // Browser test verifies client JS hydrates without ReferenceError.
  // If defineEnv didn't replace __NEXT_INVARIANTS__ in the client bundle,
  // the browser would throw because the identifier doesn't exist on the
  // client globalThis.
  it('should hydrate client components in the browser', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('#isDevServer').text()).toBe(
      String(isNextDev)
    )
    expect(await browser.elementByCss('#trailingSlash').text()).toBe('true')
    expect(
      await browser.elementByCss('#experimentalOptimisticRouting').text()
    ).toBe('true')
  })

  // Verifies the runtime global works for non-bundled (external) server code.
  // The external package reads __NEXT_INVARIANTS__ from globalThis, not via
  // defineEnv replacement.
  it('should read invariants from the runtime global in external packages', async () => {
    const $ = await next.render$('/external')
    expect($('#external-isDevServer').text()).toBe(String(isNextDev))
    expect($('#external-trailingSlash').text()).toBe('true')
    expect($('#external-experimentalOptimisticRouting').text()).toBe('true')
  })

  if (isNextStart) {
    it('should not have any __NEXT_INVARIANTS__ references in client bundles', async () => {
      const staticDir = path.join(next.testDir, '.next', 'static')
      const allFiles = await recursiveReadDir(staticDir)
      const jsFiles = allFiles.filter((file) => file.endsWith('.js'))
      expect(jsFiles.length).toBeGreaterThan(0)

      for (const file of jsFiles) {
        const content = fs.readFileSync(path.join(staticDir, file), 'utf8')
        expect(content).not.toContain('__NEXT_INVARIANTS__')
      }
    })

    it('should not have any __NEXT_INVARIANTS__ references in server bundles', async () => {
      // Load /server to ensure the server component bundle exists
      await next.render$('/server')

      const serverAppDir = path.join(next.testDir, '.next', 'server', 'app')
      const allFiles = await recursiveReadDir(serverAppDir)
      const jsFiles = allFiles.filter((file) => file.endsWith('.js'))
      expect(jsFiles.length).toBeGreaterThan(0)

      for (const file of jsFiles) {
        const content = fs.readFileSync(path.join(serverAppDir, file), 'utf8')
        expect(content).not.toContain('__NEXT_INVARIANTS__')
      }
    })
  }
})
