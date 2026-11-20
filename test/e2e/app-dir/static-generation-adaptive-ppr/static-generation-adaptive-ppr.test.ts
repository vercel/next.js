import { nextTestSetup } from 'e2e-utils'
import { gate } from 'next-test-utils'
import cheerio from 'cheerio'
import type {
  ProfileRecord,
  StaticGenerationSummary,
} from 'next/dist/export/static-generation-profile'

// Adaptive scheduling and the initial/final export handoff only run in builds.
// @force-gate !dev
describe('static-generation-adaptive-ppr', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: { NEXT_STATIC_GENERATION_PROFILE: '1' },
  })

  let buildOutput: string
  beforeAll(() => {
    buildOutput = next.cliOutput
  })

  it('serves the generated pages and an ungenerated param with request data', async () => {
    for (const id of ['0', '1', '2', '3', '4', '5', 'not-generated']) {
      const response = await next.fetch(`/adaptive/${id}`, {
        headers: { 'x-adaptive-ppr': `request-${id}` },
      })
      expect(response.status).toBe(200)
      const $ = cheerio.load(await response.text())
      expect($('#shared').text()).toBe(
        'static-generation-adaptive-ppr:shared-data'
      )
      expect($('#item').text()).toBe(`item ${id}`)
      expect($('#request').text()).toBe(`request-${id}`)
    }
  })

  it('shares the cache across chunks and profiles the initial and final phases', async () => {
    // Each concrete page is submitted in its own chunk. A per-call cache would
    // refill for later pages; a missing RDC seed would refill in the final
    // phase, whose incremental cache is intentionally new.
    expect(buildOutput).toIncludeRepeated('adaptive-ppr fetch cache fill', 1)

    // Deployment build logs are available above, but diagnostic files are not
    // exposed by a deployment. Keep only the local artifact assertions gated.
    if (await gate('!deploy')) {
      const files = await next.readFiles(
        '.next/diagnostics/static-generation',
        (filename) => filename.endsWith('.jsonl')
      )
      const records: ProfileRecord[] = files.flatMap((file) =>
        file
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line))
      )
      const pages = records.filter((record) => record.type === 'page')
      const routePages = pages.filter(
        (record) => record.page === '/adaptive/[id]/page'
      )
      expect(
        routePages
          .filter((record) => record.phase === 'initial')
          .map((record) => record.path)
          .sort()
      ).toEqual(Array.from({ length: 6 }, (_, id) => `/adaptive/${id}`))
      expect(
        routePages
          .filter((record) => record.phase === 'final')
          .map((record) => record.path)
      ).toEqual(['/adaptive/[id]'])
      expect(routePages.every((record) => record.ok)).toBe(true)

      const calls = records.filter((record) => record.type === 'call')
      expect(
        calls.filter((record) => record.phase === 'initial').length
      ).toBeGreaterThanOrEqual(6)
      expect(calls.some((record) => record.phase === 'final')).toBe(true)
      expect(calls.every((record) => record.pages <= 1)).toBe(true)

      const summary: StaticGenerationSummary = JSON.parse(
        await next.readFile('.next/diagnostics/static-generation-summary.json')
      )
      expect(summary.pages).toBe(pages.length)
      expect(summary.failedPages).toBe(0)
      expect(summary.phases.map((phase) => phase.phase)).toEqual([
        'initial',
        'final',
      ])
      expect(summary.fetchHits).toBeGreaterThanOrEqual(5)
    }
  })
})
