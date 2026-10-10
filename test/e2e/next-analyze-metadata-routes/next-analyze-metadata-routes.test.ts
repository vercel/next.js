import { nextTestSetup } from 'e2e-utils'
import { shouldUseTurbopack } from 'next-test-utils'
import path from 'node:path'
import { existsSync, readFileSync } from 'node:fs'

// @force-gate !deploy
describe('next analyze - metadata routes with several variants', () => {
  if (!shouldUseTurbopack()) {
    // Test suites require at least one test
    it('skips in non-Turbopack tests', () => {})
    return
  }

  const { next } = nextTestSetup({ files: __dirname, skipStart: true })

  it('lists each route under the path its analyze data is written to', async () => {
    const name = 'metadata-routes'
    const capture = await next.runCommand([
      'analyze',
      '--output',
      '--snapshot',
      name,
    ])
    expect(capture).toMatchObject({ exitCode: 0 })

    const dataDir = path.join(next.testDir, '.next/diagnostics/analyze/data')
    const routes: string[] = JSON.parse(
      readFileSync(path.join(dataDir, 'routes.json'), 'utf8')
    )
    expect(routes).toContain('/icon')
    expect(routes).toContain('/sitemap.xml')
    expect(routes.some((route) => route.includes('[__metadata_id__]'))).toBe(
      false
    )
    for (const route of routes) {
      expect(
        existsSync(path.join(dataDir, route.slice(1), 'analyze.data'))
      ).toBe(true)
    }

    const exported = await next.runCommand([
      'analyze',
      'export',
      next.testDir,
      '--snapshot',
      name,
    ])
    expect(exported).toMatchObject({ exitCode: 0 })
    const exportedRoutes = exported.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
      .filter((record) => record.type === 'route')
      .map((record) => record.route)
    expect(exportedRoutes).toEqual(expect.arrayContaining(routes))
  })
})
