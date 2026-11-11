import { nextTestSetup } from 'e2e-utils'
import { getClientReferenceManifest, retry } from 'next-test-utils'

// The client reference manifest format tested here is Turbopack-specific, and the test reads the
// build output from disk.
// @force-gate turbopack && !deploy
describe('client-reference-manifest-async-flags', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it.each(['a', 'b'])(
    'should hydrate the async and plain client components on /%s',
    async (page) => {
      const browser = await next.browser(`/${page}`)

      await retry(async () => {
        expect(await browser.elementByCss('#layout-marker').text()).toBe(
          'hydrated'
        )
      })
      expect(await browser.elementByCss('#page').text()).toBe(page)

      await browser.elementByCss('#async-client').click()
      await browser.elementByCss('#plain-client').click()
      await browser.elementByCss('#plain-client').click()

      await retry(async () => {
        expect(await browser.elementByCss('#async-client').text()).toBe(
          'async value: 1'
        )
        expect(await browser.elementByCss('#plain-client').text()).toBe(
          'plain value: 2'
        )
      })
    }
  )

  it('should flag async client references as async in every page', async () => {
    const entries = []
    for (const page of ['a', 'b']) {
      // Make sure the page has been compiled in dev mode.
      await next.render(`/${page}`)

      const manifest = getClientReferenceManifest(next, `/${page}/page`)
      const findEntries = (name: string) => {
        const key = Object.keys(manifest.clientModules).find((k) =>
          k.endsWith(`/app/${name}`)
        )
        expect(key).toBeDefined()
        const client = manifest.clientModules[key!]
        const ssr = manifest.ssrModuleMapping[client.id]['*']
        return { client, ssr }
      }

      const asyncClient = findEntries('async-client.tsx')
      const plainClient = findEntries('plain-client.tsx')

      expect(asyncClient.client.async).toBe(true)
      expect(asyncClient.ssr.async).toBe(true)
      expect(plainClient.client.async).toBe(false)
      expect(plainClient.ssr.async).toBe(false)

      // Both client references are used by the same segment, so they share the chunk lists.
      expect(asyncClient.client.chunks.length).toBeGreaterThan(0)
      expect(plainClient.client.chunks).toBe(asyncClient.client.chunks)
      expect(asyncClient.ssr.chunks.length).toBeGreaterThan(0)
      expect(plainClient.ssr.chunks).toBe(asyncClient.ssr.chunks)

      entries.push(
        [asyncClient, plainClient].map(({ client, ssr }) => ({
          clientId: client.id,
          clientAsync: client.async,
          ssrId: ssr.id,
          ssrAsync: ssr.async,
        }))
      )
    }

    // The pages share the client references, so their ids and flags match.
    expect(entries[1]).toEqual(entries[0])
  })
})
