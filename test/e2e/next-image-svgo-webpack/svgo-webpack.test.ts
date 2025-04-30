import { nextTestSetup } from 'e2e-utils'

// Skip as this is a webpack specific test.
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'svgo-webpack with Image Component',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipDeployment: true,
      dependencies: {
        '@svgr/webpack': '8.1.0',
      },
    })

    it('should print error when invalid Image usage', async () => {
      const { status } = await next.fetch('/')
      expect(status).toBe(200)
    })
  }
)
