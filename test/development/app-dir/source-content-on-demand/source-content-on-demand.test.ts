import { nextTestSetup } from 'e2e-utils'
import { getRedboxDescription, getRedboxSource, retry } from 'next-test-utils'

// This feature (experimental.turbopackServeSourceContent) is Turbopack-only.
const isTurbopack = Boolean(process.env.IS_TURBOPACK_TEST)
;(isTurbopack ? describe : describe.skip)(
  'source content served on demand (turbopack dev)',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    async function getClientChunkMapUrls(): Promise<string[]> {
      const html = await next.render('/')
      // Client JS chunks are referenced via <script src="/_next/static/...js">.
      const scriptSrcs = Array.from(
        html.matchAll(/src="(\/_next\/static\/[^"]+\.js)"/g)
      ).map((m) => m[1])
      // Their source maps are served at the same path with `.map`, or via the
      // /__nextjs_source-map endpoint. Prefer the direct static `.map`.
      return scriptSrcs.map((src) => `${src}.map`)
    }

    it('omits inlined sourcesContent for project files and sets sourceRoot', async () => {
      // Load the page so the client chunks + maps are compiled.
      const browser = await next.browser('/')
      await retry(async () => {
        expect(await browser.elementByCss('#msg').text()).toBe('hello world')
      })

      const mapUrls = await getClientChunkMapUrls()
      expect(mapUrls.length).toBeGreaterThan(0)

      let sawProjectSource = false

      for (const mapUrl of mapUrls) {
        const res = await next.fetch(mapUrl)
        if (res.status !== 200) continue
        const map = await res.json()

        // A sectioned map: inspect each section; otherwise the top-level map.
        const sectionMaps = map.sections
          ? map.sections.map((s: any) => s.map)
          : [map]

        for (const section of sectionMaps) {
          const sources: (string | null)[] = section.sources ?? []
          const sourcesContent: (string | null)[] = section.sourcesContent ?? []

          const projectSourceIndexes = sources
            .map((s, i) => ({ s, i }))
            .filter(
              ({ s }) =>
                // Project sources are now relative (no scheme) and resolved via
                // sourceRoot. Virtual sources keep their turbopack:/// scheme.
                typeof s === 'string' &&
                !s.startsWith('turbopack://') &&
                !s.startsWith('webpack://') &&
                !s.includes('node_modules')
            )

          if (projectSourceIndexes.length > 0) {
            sawProjectSource = true
            // sourceRoot must point at the on-demand content endpoint.
            expect(section.sourceRoot).toBe(
              '/__nextjs_source-content/[project]/'
            )
            // Project sources must NOT have inlined content.
            for (const { i } of projectSourceIndexes) {
              expect(sourcesContent[i] ?? null).toBeNull()
            }
          }
        }
      }

      expect(sawProjectSource).toBe(true)
    })

    it('serves referenced project source content on demand', async () => {
      // Ensure the page (and its maps) are compiled first so the file is admitted.
      await next.render('/')

      const res = await next.fetch(
        '/__nextjs_source-content/[project]/lib/util.ts'
      )
      expect(res.status).toBe(200)
      const body = await res.text()
      expect(body).toContain('UNIQUE_SOURCE_MARKER_FOR_TEST')
    })

    it('does not serve files never referenced by a source map', async () => {
      await next.render('/')

      // A file that exists in the project but is not part of any module graph /
      // source map should not be served.
      const res = await next.fetch(
        '/__nextjs_source-content/[project]/next.config.js'
      )
      // Either 204 (no content, filtered) — never 200 with the file body.
      expect(res.status).not.toBe(200)
    })

    it('rejects path traversal outside the project root', async () => {
      await next.render('/')

      const res = await next.fetch(
        '/__nextjs_source-content/[project]/../../../../etc/passwd'
      )
      expect(res.status).not.toBe(200)
    })

    it('traces error frames back to project source (not framework internals)', async () => {
      // With content served on demand the source map uses `sourceRoot` + relative
      // sources. The error overlay must still trace the top frame back to the
      // project file and ignore-list framework/node_modules frames — regressions
      // here show up as unresolved `file://` frames in the redbox stack.
      const browser = await next.browser('/throws')

      const stackText = await retry(async () => {
        const description = await getRedboxDescription(browser)
        expect(description).toContain('boom from throws page')
        const source = await getRedboxSource(browser)
        // The code frame must resolve to the project source file; if it hasn't
        // populated yet, keep retrying.
        expect(source ?? '').toContain('app/throws/page.tsx')
        return source ?? ''
      })

      // The traced source must point at the project file, not an unresolved
      // compiled `file://` chunk path or a `.next/` build artifact.
      expect(stackText).not.toContain('file://')
      expect(stackText).not.toContain('.next/')
    })

    it('resolves server (SSR) error frames via the on-demand content sourceRoot', async () => {
      // Server source maps also drop inlined `sourcesContent` and set `sourceRoot`
      // to the on-demand content endpoint. A server render error must still resolve
      // its top frame back to the project file — the resolved frame carries the
      // on-demand `sourceRoot` prefix, which only appears when content is served on
      // demand (rather than a raw compiled `.next/` chunk path).
      await next.render('/throws-server')

      await retry(async () => {
        expect(next.cliOutput).toContain('boom from throws server page')
        // The traced server frame points at the project file via the on-demand
        // content sourceRoot, not an unresolved `.next/` build artifact.
        expect(next.cliOutput).toMatch(
          /ThrowsServerPage \(.*__nextjs_source-content\/\[project\]\/app\/throws-server\/page\.tsx/
        )
      })
      expect(next.cliOutput).not.toMatch(/ThrowsServerPage \(.*\.next\//)
    })
  }
)
