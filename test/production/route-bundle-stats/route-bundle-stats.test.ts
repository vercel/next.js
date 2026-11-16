import { nextTestSetup } from 'e2e-utils'

// Route bundle stats are only emitted by Turbopack.
// @force-gate turbopack
describe('route-bundle-stats', () => {
  const { next, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDeploy) {
    it('should skip', () => {})
    return
  }

  const STATS_PATH = '.next/diagnostics/route-bundle-stats.json'

  it('writes .next/diagnostics/route-bundle-stats.json after build', async () => {
    const raw = await next.readFile(STATS_PATH)
    const stats = JSON.parse(raw)

    expect(Array.isArray(stats)).toBe(true)
    expect(stats.length).toBeGreaterThan(0)

    for (const entry of stats) {
      expect(typeof entry.route).toBe('string')
      expect(entry.route).toMatch(/^\//)
      expect(typeof entry.firstLoadUncompressedJsBytes).toBe('number')
      expect(entry.firstLoadUncompressedJsBytes).toBeGreaterThan(0)
      expect(Array.isArray(entry.firstLoadChunkPaths)).toBe(true)
      expect(entry.firstLoadChunkPaths.length).toBeGreaterThan(0)

      for (const chunkPath of entry.firstLoadChunkPaths) {
        // Paths use forward slashes on all platforms.
        expect(chunkPath).toMatch(/^\.next\//)
        expect(chunkPath).not.toContain('\\')
      }
    }

    // Entries are sorted descending by firstLoadUncompressedJsBytes.
    for (let i = 1; i < stats.length; i++) {
      expect(stats[i - 1].firstLoadUncompressedJsBytes).toBeGreaterThanOrEqual(
        stats[i].firstLoadUncompressedJsBytes
      )
    }
  })

  it('includes both Pages Router and App Router routes', async () => {
    const stats = JSON.parse(await next.readFile(STATS_PATH))
    const routes = stats.map((e: { route: string }) => e.route)

    expect(routes).toContain('/')
    expect(routes).toContain('/blog')
  })
})
