import { nextTestSetup } from 'e2e-utils'
import { join } from 'node:path'
import { readdir } from 'node:fs/promises'

describe('css-module-build-manifest', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should have the static css file in build-manifest', async () => {
    const { pages }: { pages: { [key: string]: string[] } } =
      await next.readJSON('.next/build-manifest.json')

    const staticCSSFiles = await readdir(join(next.testDir, '.next/static/css'))
    // green + red
    expect(staticCSSFiles).toContain('d3cb04b05c4b676e.css')
    // red
    expect(staticCSSFiles).toContain('b08135001b6a6644.css')

    // green + red
    expect(pages['/']).toContain('static/css/d3cb04b05c4b676e.css')

    // red
    expect(pages['/next-dynamic']).toContain('static/css/b08135001b6a6644.css')
    expect(pages['/next-dynamic-no-ssr']).toContain(
      'static/css/b08135001b6a6644.css'
    )
    expect(pages['/dynamic-import']).toContain(
      'static/css/b08135001b6a6644.css'
    )

    // no green
    expect(pages['/next-dynamic']).not.toContain(
      'static/css/d3cb04b05c4b676e.css'
    )
    expect(pages['/next-dynamic-no-ssr']).not.toContain(
      'static/css/d3cb04b05c4b676e.css'
    )
    expect(pages['/dynamic-import']).not.toContain(
      'static/css/d3cb04b05c4b676e.css'
    )
  })
})
