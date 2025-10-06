import { nextTestSetup } from 'e2e-utils'
import { fetchViaHTTP } from 'next-test-utils'
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'Slow Module Detection',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
      overrideFiles: {
        'utils/slow-module.js': `
          // This module is intentionally made complex to trigger slow compilation
          ${Array(2000)
            .fill(0)
            .map(
              (_, i) => `
              export const value${i} = ${JSON.stringify(
                Array(100).fill(`some-long-string-${i}`).join('')
              )}
            `
            )
            .join('\n')}
        `,
      },
    })

    it('should detect slow modules in webpack mode', async () => {
      let logs = ''
      next.on('stdout', (log) => {
        logs += log
      })

      // Trigger a compilation by making a request
      await fetchViaHTTP(next.url, '/')

      // Wait for compilation to complete and check logs
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // Verify slow module detection output
      expect(logs).toContain('🐌 Detected slow modules while compiling client:')
      expect(logs).toContain('./utils/slow-module.js')
    })
  }
)
