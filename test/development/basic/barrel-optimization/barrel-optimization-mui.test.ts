import { join } from 'path'
import { createNextDescribe } from 'e2e-utils'
import { hasRedbox } from 'next-test-utils'
// Skipped in Turbopack, will be added later.
;(process.env.TURBOPACK ? describe.skip : describe)(
  'Skipped in Turbopack',
  () => {
    createNextDescribe(
      'optimizePackageImports - mui',
      {
        env: {
          NEXT_TEST_MODE: '1',
        },
        files: join(__dirname, 'fixture'),

        dependencies: {
          '@mui/material': '5.15.4',
          '@emotion/react': '11.11.1',
          '@emotion/styled': '11.11.0',
        },
      },
      ({ next }) => {
        it('should support MUI', async () => {
          let logs = ''
          next.on('stdout', (log) => {
            logs += log
          })

          // Ensure that MUI is working
          const $ = await next.render$('/mui')
          expect(await $('#button').text()).toContain('button')
          expect(await $('#typography').text()).toContain('typography')

          const browser = await next.browser('/mui')
          expect(await hasRedbox(browser)).toBe(false)

          const modules = [...logs.matchAll(/\((\d+) modules\)/g)]
          expect(modules.length).toBeGreaterThanOrEqual(1)
          for (const [, moduleCount] of modules) {
            // Ensure that the number of modules is less than 1500 - otherwise we're
            // importing the entire library.
            expect(parseInt(moduleCount)).toBeLessThan(1500)
          }
        })
      }
    )
  }
)
