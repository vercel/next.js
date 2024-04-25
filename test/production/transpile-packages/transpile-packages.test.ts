import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'app fetch build cache',
  {
    files: __dirname,
    dependencies: {
      '@aws-sdk/client-s3': 'latest',
      lodash: 'latest',
      'fast-xml-parser': '4.2.5', // https://github.com/aws/aws-sdk-js-v3/issues/5866#issuecomment-1984616572
    },
  },
  ({ next }) => {
    it('should render page with dependencies', async () => {
      const $ = await next.render$('/')
      expect($('#key').text()).toBe('Key: key1')
      expect($('#isObject').text()).toBe('isObject: true')
    })

    it('should bundle @aws-sdk/client-s3 as a transpiled package', async () => {
      const output = await next.readFile('.next/server/app/page.js')
      expect(output).not.toContain('require("@aws-sdk/client-s3")')
    })
  }
)
