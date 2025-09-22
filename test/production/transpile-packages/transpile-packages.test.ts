import { nextTestSetup } from 'e2e-utils'
import { getDistDir } from 'next-test-utils'

describe('app fetch build cache', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      '@aws-sdk/client-s3': 'latest',
      lodash: 'latest',
    },
  })

  it('should render page with dependencies', async () => {
    const $ = await next.render$('/')
    expect($('#key').text()).toBe('Key: key1')
    expect($('#isObject').text()).toBe('isObject: true')
  })

  it('should bundle @aws-sdk/client-s3 as a transpiled package', async () => {
    const output = await next.readFile(getDistDir() + '/server/app/page.js')
    expect(output).not.toContain('require("@aws-sdk/client-s3")')
  })
})
