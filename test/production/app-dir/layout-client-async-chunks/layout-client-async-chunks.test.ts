import { FileRef, nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { join } from 'node:path'

// The layout and dashboard share a client reference, but only the dashboard
// renders the chart. Reaching that reference through async server imports must
// not make the dashboard's other client entries part of the layout.
describe('layout client chunks', () => {
  const variants = [
    'async',
    'nested',
    'cyclic',
    'unrelated-cycle',
    'static',
    'mixed',
    'unshared',
  ]
  const files: Record<string, FileRef> = {
    'next.config.ts': new FileRef(join(__dirname, 'next.config.ts')),
  }
  // Build all variants together, with distinct root layouts and client modules.
  for (const variant of variants) {
    const app = `app/${variant}/(root)`
    const lib = `app/${variant}/lib`
    files[app] = new FileRef(join(__dirname, 'app'))
    files[lib] = new FileRef(join(__dirname, 'lib'))
    if (variant === 'nested' || variant === 'cyclic') {
      files[`${lib}/data.ts`] = new FileRef(
        join(__dirname, 'variants/nested.ts')
      )
    }
    if (variant === 'cyclic') {
      files[`${lib}/on-error.ts`] = new FileRef(
        join(__dirname, 'variants/cyclic.ts')
      )
    }
    if (variant === 'static') {
      files[`${app}/layout.tsx`] = new FileRef(
        join(__dirname, 'variants/static-layout.tsx')
      )
    }
    if (variant === 'mixed') {
      files[`${app}/layout.tsx`] = new FileRef(
        join(__dirname, 'variants/mixed-layout.tsx')
      )
      files[`${lib}/intermediate.ts`] = new FileRef(
        join(__dirname, 'variants/mixed-intermediate.ts')
      )
    }
    if (variant === 'unrelated-cycle' || variant === 'mixed') {
      files[`${app}/dashboard/[id]/page.tsx`] = new FileRef(
        join(__dirname, 'variants/unrelated-cycle-page.tsx')
      )
    }
    if (variant === 'unshared') {
      files[`${app}/dashboard/[id]/page.tsx`] = new FileRef(
        join(__dirname, 'variants/unshared-page.tsx')
      )
    }
  }
  const { next, isTurbopack } = nextTestSetup({ files })

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

  describe.each(variants)('%s', (variant) => {
    const path = `/${variant}`

    it('keeps required layout and home code without dashboard-only code', async () => {
      const scripts = await initialScripts(path)
      // Turbopack includes references discovered behind server-side import().
      // Webpack defers the unused helper, except when it shares the async group
      // with the sibling that the mixed layout renders.
      expect(scripts.includes('layout-analytics-marker')).toBe(
        isTurbopack || variant === 'mixed'
      )
      expect(scripts.includes('home-counter-marker')).toBe(true)
      expect(scripts.includes('dashboard-chart-marker')).toBe(false)

      if (variant === 'mixed') {
        // The shared reference has direct and async ownership matches, while this
        // sibling is async-only. Unrelated dashboard async groups must stay out.
        expect(scripts).toContain('async-only-marker')
        expect(await next.render(path)).toContain('async-only-marker')
        const browser = await next.browser(path)
        expect(await browser.elementById('async-only').text()).toBe(
          'async-only-marker 0'
        )
        await browser.elementById('async-only').click()
        await retry(async () => {
          expect(await browser.elementById('async-only').text()).toBe(
            'async-only-marker 1'
          )
        })
      }
    })

    it('retains dashboard-only code on the dashboard', async () => {
      const scripts = await initialScripts(`${path}/dashboard/test`)
      expect(scripts.includes('dashboard-chart-marker')).toBe(true)
      expect(scripts.includes('layout-analytics-marker')).toBe(
        isTurbopack || variant !== 'unshared'
      )
    })
  })
})
