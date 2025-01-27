import { createNext, NextInstance } from 'e2e-utils'
import { fetchViaHTTP } from 'next-test-utils'
;(process.env.TURBOPACK ? describe.skip : describe)(
  'Slow Module Detection',
  () => {
    let next: NextInstance

    beforeAll(async () => {
      next = await createNext({
        files: {
          'pages/index.js': `
          import * as slowModule from '../utils/slow-module'
          
          export default function Page() {
            return <div>Hello World</div>
          }
        `,
          // Create a module that will be slow to compile
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
          'next.config.js': `
          module.exports = {
            experimental: {
              slowModuleDetectionWebpack: {
                slowModuleThresholdMs: 50, // Lower threshold for testing
                pathTruncationLength: 50
              }
            }
          }
        `,
        },
        dependencies: {
          react: 'latest',
          'react-dom': 'latest',
        },
      })
    })

    afterAll(async () => {
      await next.destroy()
    })

    it('should detect slow modules in webpack mode', async () => {
      const logs: string[] = []
      next.on('stdout', (log) => {
        logs.push(log)
      })

      // Trigger a compilation by making a request
      await fetchViaHTTP(next.url, '/')

      // Wait for compilation to complete and check logs
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // Verify slow module detection output
      let foundCompiling = false
      let foundSlowModule = false

      for (const log of logs) {
        if (log.includes('🐌 Detected slow modules while compiling client:')) {
          foundCompiling = true
        }
        if (log.includes('./utils/slow-module.js')) {
          foundSlowModule = true
        }
      }

      expect(foundCompiling).toBe(true)
      expect(foundSlowModule).toBe(true)
    })
  }
)
