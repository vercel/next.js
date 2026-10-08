import { nextTestSetup } from 'e2e-utils'
import cheerio from 'cheerio'

// `test.avif` in this fixture is a 400x400 AVIF image, but Turbopack cannot
// decode AVIF, so it emits the file unprocessed and the static import metadata
// falls back to a 100x100 placeholder. `next/image` therefore renders wrong
// intrinsic dimensions. This suite documents that current, incorrect behavior;
// when Turbopack learns to read AVIF dimensions these expectations must be
// updated to the real 400x400 size.
// @force-gate turbopack && !deploy
describe('turbopack avif static import', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('uses fallback 100x100 metadata for a statically imported avif', async () => {
    const $ = cheerio.load(await next.render('/'))
    const meta = JSON.parse($('#avif-meta').text())

    expect(meta.src).toMatch(/\.avif$/)
    // The real image is 400x400.
    expect([meta.width, meta.height]).toEqual([100, 100])

    const img = $('#avif-img')
    expect(img.attr('width')).toBe('100')
    expect(img.attr('height')).toBe('100')
  })
})
