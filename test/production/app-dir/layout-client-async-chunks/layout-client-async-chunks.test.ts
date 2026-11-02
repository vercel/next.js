import { FileRef, nextTestSetup } from 'e2e-utils'
import { join } from 'node:path'

// The layout and dashboard share a client reference, but only the dashboard
// renders the chart. Reaching that reference through async server imports must
// not make the dashboard's other client entries part of the layout.
describe.each([
  'async',
  'nested',
  'cyclic',
  'unrelated-cycle',
  'static',
  'unshared',
])('layout client chunks: %s', (variant) => {
  const { next, isTurbopack } = nextTestSetup({
    files: {
      app: new FileRef(join(__dirname, 'app')),
      lib: new FileRef(join(__dirname, 'lib')),
      'next.config.ts': new FileRef(join(__dirname, 'next.config.ts')),
      ...(variant === 'nested' || variant === 'cyclic'
        ? { 'lib/data.ts': new FileRef(join(__dirname, 'variants/nested.ts')) }
        : {}),
      ...(variant === 'cyclic'
        ? {
            'lib/on-error.ts': new FileRef(
              join(__dirname, 'variants/cyclic.ts')
            ),
          }
        : {}),
      ...(variant === 'static'
        ? {
            'app/layout.tsx': new FileRef(
              join(__dirname, 'variants/static-layout.tsx')
            ),
          }
        : {}),
      ...(variant === 'unrelated-cycle'
        ? {
            'app/dashboard/[id]/page.tsx': new FileRef(
              join(__dirname, 'variants/unrelated-cycle-page.tsx')
            ),
          }
        : {}),
      ...(variant === 'unshared'
        ? {
            'app/dashboard/[id]/page.tsx': new FileRef(
              join(__dirname, 'variants/unshared-page.tsx')
            ),
          }
        : {}),
    },
  })

  async function initialScripts(path: string) {
    const $ = await next.render$(path)
    const sources = $('script[src]')
      .toArray()
      .map((element) => $(element).attr('src'))
    expect(sources.length).toBeGreaterThan(0)
    return (
      await Promise.all(
        sources.map(async (source) => {
          const response = await next.fetch(source)
          expect(response.status).toBe(200)
          return response.text()
        })
      )
    ).join('\n')
  }

  it('keeps required layout and home code without dashboard-only code', async () => {
    const scripts = await initialScripts('/')
    // Turbopack includes references discovered behind server-side import().
    // Webpack defers this otherwise unused helper instead of loading it eagerly.
    expect(scripts.includes('layout-analytics-marker')).toBe(isTurbopack)
    expect(scripts.includes('home-counter-marker')).toBe(true)
    expect(scripts.includes('dashboard-chart-marker')).toBe(false)
  })

  it('retains dashboard-only code on the dashboard', async () => {
    const scripts = await initialScripts('/dashboard/test')
    expect(scripts.includes('dashboard-chart-marker')).toBe(true)
    expect(scripts.includes('layout-analytics-marker')).toBe(
      isTurbopack || variant !== 'unshared'
    )
  })
})
