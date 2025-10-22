import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'
import { assertNoRedbox } from 'next-test-utils'

// This is implemented in Turbopack, but Turbopack doesn't log the module count.
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
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
        // Ensure that MUI is working
        const $ = await next.render$('/mui')
        expect($('#button').text()).toContain('button')
        expect($('#typography').text()).toContain('typography')

        const browser = await next.browser('/mui')
        await assertNoRedbox(browser)
      })
    })
  }
)
