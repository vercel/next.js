import { nextTestSetup } from 'e2e-utils'

describe('Skipped in Turbopack', () => {
  describe('app-dir - optimizePackageImports - mui', () => {
    const { next } = nextTestSetup({
      files: __dirname,

      dependencies: {
        '@mui/material': '5.15.15',
        '@emotion/react': '11.11.1',
        '@emotion/styled': '11.11.0',
      },
    })

    it('should build successfully', async () => {
      // Ensure that MUI is working
      const $ = await next.render$('/')
      expect(await $('#typography').text()).toContain('typography')
    })
  })
})
