import { nextTestSetup } from 'e2e-utils'

describe('browserslist-unknown-version', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  it('renders the unexpanded regex source', async () => {
    const html = await next.render('/')
    expect(html).toContain('source=\\p{Script=Han}')
    expect(html).toContain('hit=true')
  })

  it('does not downlevel app code when the target is newer than the bundled compat data', async () => {
    const html = await next.render('/')

    // Fetch every referenced client chunk over HTTP (works in dev, where chunks are
    // served from memory, as well as in production). Neither "the page's chunk" nor
    // `class`-keyword grepping is a reliable signal (framework chunks contain both
    // regardless), so check all of them.
    const srcs = [...html.matchAll(/src="([^"]+\.js[^"]*)"/g)].map((m) => m[1])
    expect(srcs.length).toBeGreaterThan(0)
    const chunks = await Promise.all(
      srcs.map((src) => next.fetch(src).then((res) => res.text()))
    )

    // The property escape must be kept as-is …
    expect(chunks.some((chunk) => chunk.includes('Script=Han'))).toBe(true)
    // … and never expanded into a bracketed character class (the expansion changes
    // regex semantics for libraries that splice `.source` into larger classes).
    expect(chunks.every((chunk) => !chunk.includes('2E80'))).toBe(true)
    // The fixture's own class must not be downleveled to an ES5 function. Only check
    // the chunks carrying the fixture's `source=` marker (the discussion notes two
    // chunks can carry it): framework chunks can legitimately contain this guard
    // regardless. Precompiled node_modules chunks contain it in dev, so only assert
    // it on production builds.
    if (!isNextDev) {
      const appChunks = chunks.filter((chunk) => chunk.includes('source='))
      expect(appChunks.length).toBeGreaterThan(0)
      for (const appChunk of appChunks) {
        expect(appChunk).not.toContain('Cannot call a class as a function')
      }
    }
  })
})
