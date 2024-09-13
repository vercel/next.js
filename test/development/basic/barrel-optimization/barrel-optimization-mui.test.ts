import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'
import { assertNoRedbox } from 'next-test-utils'

// Skipped in Turbopack, will be added later.
;(process.env.TURBOPACK ? describe.skip : describe)(
  'Skipped in Turbopack',
  () => {
    describe('optimizePackageImports - mui', () => {
      const { next } = nextTestSetup({
        env: {
          NEXT_TEST_MODE: '1',
        },
        files: join(__dirname, 'fixture'),

        dependencies: {
          '@mui/material': '5.15.15',
          '@emotion/react': '11.11.1',
          '@emotion/styled': '11.11.0',
        },
      })

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
        await assertNoRedbox(browser)

        const modules = [...logs.matchAll(/\((\d+) modules\)/g)]
        expect(modules.length).toBeGreaterThanOrEqual(1)
        for (const [, moduleCount] of modules) {
          // Ensure that the number of modules is less than 1500 - otherwise we're
          // importing the entire library.
          expect(parseInt(moduleCount)).toBeLessThan(1500)
        }
      })
    })
  }
)
