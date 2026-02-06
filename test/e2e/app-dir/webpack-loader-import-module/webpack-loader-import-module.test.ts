import { nextTestSetup } from 'e2e-utils'

// Turbopack does not support this.importModule() in loaders yet
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'webpack-loader-import-module',
  () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      skipDeployment: true,
    })

    if (skipped) {
      return
    }

    it('should support this.importModule() in a webpack loader', async () => {
      const $ = await next.render$('/')
      expect($('#title').text()).toBe('Import Module Works')
      expect($('#items').text()).toBe('apple, banana, cherry')
    })
  }
)
