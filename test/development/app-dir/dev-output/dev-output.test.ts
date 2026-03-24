import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

const cacheComponentsEnabled = process.env.__NEXT_CACHE_COMPONENTS === 'true'

describe('dev-output', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  it('shows Cache Components indicator when enabled', async () => {
    await next.fetch('/')
    await retry(async () => {
      const output = next.cliOutput

      if (cacheComponentsEnabled) {
        if (isTurbopack) {
          expect(output).toContain('Next.js')
          expect(output).toContain('Turbopack')
          expect(output).toContain('Cache Components')
        } else {
          expect(output).toContain('Next.js')
          expect(output).toContain('webpack')
          expect(output).toContain('Cache Components')
        }
      } else {
        // When cache components env is not set, should not show the indicator
        expect(output).toContain('Next.js')
        if (isTurbopack) {
          expect(output).toContain('Turbopack')
        } else {
          expect(output).toContain('webpack')
        }
        expect(output).not.toContain('Cache Components')
      }
    })
  })
})
