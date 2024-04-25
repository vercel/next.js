import { createNextDescribe } from 'e2e-utils'

describe('Skipped in Turbopack', () => {
  createNextDescribe(
    'app-dir - optimizePackageImports - basic',
    {
      files: __dirname,
    },
    ({ next }) => {
      it('should build successfully', async () => {
        const $ = await next.render$('/')
        expect(await $('#client-mod').text()).toContain('client:default')
      })

      it('should handle mixed imports from barrel optimized lib correctly', async () => {
        const $ = await next.render$('/mixed-barrel-imports')
        expect(await $('#component').attr('style')).toContain('color:blue')
      })
    }
  )
})
