import { nextTestSetup } from 'e2e-utils'

describe('Skipped in Turbopack', () => {
  describe('app-dir - optimizePackageImports - basic', () => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    it('should build successfully', async () => {
      const $ = await next.render$('/')
      expect(await $('#client-mod').text()).toContain('client:default')
    })

    it('should handle mixed imports from barrel optimized lib correctly', async () => {
      const $ = await next.render$('/mixed-barrel-imports')
      expect(await $('#component').attr('style')).toContain('color:blue')
    })
  })
})
