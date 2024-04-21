import { createNextDescribe } from 'e2e-utils'

describe('Skipped in Turbopack', () => {
  createNextDescribe(
    'app-dir - optimizePackageImports - mui',
    {
      files: __dirname,

      dependencies: {
        '@mui/material': '5.15.15',
        '@emotion/react': '11.11.1',
        '@emotion/styled': '11.11.0',
      },
    },
    ({ next }) => {
      it('should build successfully', async () => {
        // Ensure that MUI is working
        const $ = await next.render$('/')
        expect(await $('#typography').text()).toContain('typography')
      })
    }
  )
})
