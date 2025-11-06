import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts-import-alias-paths-with-baseurl-esm', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    packageJson: {
      type: 'module',
    },
  })

  it('should support import alias paths with baseUrl (ESM)', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('foobar')
  })
})
