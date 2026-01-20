import { nextTestSetup } from 'e2e-utils'

// Skip test in Turbopack - only run in webpack
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'webpack-loader-module-type',
  () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      skipDeployment: true,
    })

    if (skipped) return

    it('should load svg as asset/resource and return URL', async () => {
      const $ = await next.render$('/')
      const src = $('#svg-url').text()
      // asset/resource should emit the file and return URL path
      expect(src).toMatch(/\/_next\/static\/media\/test\.[a-f0-9]+\.svg$/)
    })
  }
)
