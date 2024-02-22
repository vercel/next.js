import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'next-config-esm-no-default-export-pkg-type-module',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should build and start if package.json type: module', async () => {
      const $ = await next.render$('/')
      expect($('p').text()).toBe('hello world')
    })
  }
)
