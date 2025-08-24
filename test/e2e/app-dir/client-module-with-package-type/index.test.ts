import { nextTestSetup } from 'e2e-utils'

describe('esm-client-module-without-exports', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  describe('"type": "commonjs" in package.json', () => {
    it('should render without errors: import cjs', async () => {
      const $ = await next.render$('/import-cjs')
      expect($('p').text()).toContain('lib-cjs: esm')
    })

    it('should render without errors: require cjs', async () => {
      const $ = await next.render$('/require-cjs')
      expect($('p').text()).toContain('lib-cjs: cjs')
    })
  })

  describe('"type": "module" in package.json', () => {
    it('should render without errors: import esm', async () => {
      const $ = await next.render$('/import-esm')
      expect($('p').text()).toContain('lib-esm: esm')
    })

    it('should render without errors: require esm', async () => {
      const $ = await next.render$('/require-esm')
      expect($('p').text()).toContain('lib-esm: cjs')
    })
  })
})
