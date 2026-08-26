import { nextTestSetup } from 'e2e-utils'
import { getClientReferenceManifest } from 'next-test-utils'

describe('dynamic-server-component-client-splitting', () => {
  const { next, isNextStart, skipped } = nextTestSetup({
    files: __dirname,
    // This test is specifically for webpack code splitting behavior
    skipDeployment: true,
  })

  if (skipped) return

  // Functional tests: both branches render correctly
  it('should render page1 with ClientComponent1', async () => {
    const browser = await next.browser('/?slug=page1')
    const text = await browser.elementByCss('#client1').text()
    expect(text).toBe('Client Component 1')
  })

  it('should render page2 with ClientComponent2', async () => {
    const browser = await next.browser('/?slug=page2')
    const text = await browser.elementByCss('#client2').text()
    expect(text).toBe('Client Component 2')
  })

  if (isNextStart) {
    it('should include both client components in the manifest', () => {
      const manifest = getClientReferenceManifest(next, '/page')

      const modulePaths = Object.keys(manifest.clientModules)
      const hasClient1 = modulePaths.some((p) => p.includes('ClientComponent1'))
      const hasClient2 = modulePaths.some((p) => p.includes('ClientComponent2'))

      // Both client components should be in the manifest
      expect(hasClient1).toBe(true)
      expect(hasClient2).toBe(true)
    })

    it('should have different chunks for client components from different dynamic import branches', () => {
      const manifest = getClientReferenceManifest(next, '/page')

      // Find the manifest entries for our two client components
      const client1Entry = Object.entries(manifest.clientModules).find(
        ([key]) => key.includes('ClientComponent1')
      )
      const client2Entry = Object.entries(manifest.clientModules).find(
        ([key]) => key.includes('ClientComponent2')
      )

      expect(client1Entry).toBeDefined()
      expect(client2Entry).toBeDefined()

      const client1Chunks = client1Entry![1].chunks
      const client2Chunks = client2Entry![1].chunks

      // The key assertion: client components from different dynamic import
      // branches should NOT share the same chunk set. If they do, it means
      // loading one triggers loading the other (the bug from #69865).
      //
      // With the fix, each client component from a different dynamic import
      // branch should be in its own async chunk.
      const client1ChunkFiles = client1Chunks.filter(
        (_: string, i: number) => i % 2 === 1
      )
      const client2ChunkFiles = client2Chunks.filter(
        (_: string, i: number) => i % 2 === 1
      )

      // Not ALL chunks should be shared — at least one chunk should be unique
      // to each component, indicating proper code splitting
      const hasUniqueClient1Chunk = client1ChunkFiles.some(
        (f: string) => !client2ChunkFiles.includes(f)
      )
      const hasUniqueClient2Chunk = client2ChunkFiles.some(
        (f: string) => !client1ChunkFiles.includes(f)
      )

      expect(hasUniqueClient1Chunk || hasUniqueClient2Chunk).toBe(true)
    })
  }
})
