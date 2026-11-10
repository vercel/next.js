import fs from 'fs'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { getClientReferenceManifest, retry } from 'next-test-utils'

// The client reference manifest file layout tested here is Turbopack-specific, and the test reads
// the build output from disk.
// @force-gate turbopack && !deploy
describe('client-reference-manifest-shared-chunks', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should hydrate the client components', async () => {
    const browser = await next.browser('/')

    await retry(async () => {
      expect(await browser.elementByCss('#layout-marker').text()).toBe(
        'hydrated'
      )
    })

    await browser.elementByCss('#counter-a').click()
    await browser.elementByCss('#counter-b').click()
    await browser.elementByCss('#counter-b').click()

    await retry(async () => {
      expect(await browser.elementByCss('#counter-a').text()).toBe('A: 1')
      expect(await browser.elementByCss('#counter-b').text()).toBe('B: 2')
    })
  })

  it('should emit the chunk lists of client references in the same segment only once', async () => {
    // Make sure the page has been compiled in dev mode.
    await next.render('/')

    const manifest = getClientReferenceManifest(next, '/page')

    const findClientModule = (name: string) => {
      const key = Object.keys(manifest.clientModules).find((k) =>
        k.includes(name)
      )
      expect(key).toBeDefined()
      return manifest.clientModules[key!]
    }

    const counterA = findClientModule('counter-a.tsx')
    const counterB = findClientModule('counter-b.tsx')

    // Both counters are used by the same segment, so they need the same chunks. The manifest
    // file emits the list once and both entries share it.
    expect(Array.isArray(counterA.chunks)).toBe(true)
    expect(counterA.chunks.length).toBeGreaterThan(0)
    expect(counterB.chunks).toBe(counterA.chunks)

    const ssrA = manifest.ssrModuleMapping[counterA.id]['*']
    const ssrB = manifest.ssrModuleMapping[counterB.id]['*']
    expect(Array.isArray(ssrA.chunks)).toBe(true)
    expect(ssrA.chunks.length).toBeGreaterThan(0)
    expect(ssrB.chunks).toBe(ssrA.chunks)

    const manifestSource = await fs.promises.readFile(
      path.join(
        next.testDir,
        next.distDir,
        'server/app/page_client-reference-manifest.js'
      ),
      'utf8'
    )
    // The shared SSR chunk list is emitted exactly once, instead of once per client reference.
    const occurrences = (needle: string) =>
      manifestSource.split(needle).length - 1
    expect(occurrences(JSON.stringify(ssrA.chunks))).toBe(1)
    expect(occurrences(JSON.stringify(counterA.chunks))).toBe(1)
  })
})
