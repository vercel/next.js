import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'app dir - dynamic css',
  {
    files: __dirname,
    skipDeployment: true,
  },
  ({ next }) => {
    it('should preload css of dynamic component during SSR', async () => {
      const $ = await next.render$('/ssr')
      const cssLinks = $('link[rel="preload stylesheet"]')
      expect(cssLinks.attr('href')).toContain('.css')
    })
  }
)
