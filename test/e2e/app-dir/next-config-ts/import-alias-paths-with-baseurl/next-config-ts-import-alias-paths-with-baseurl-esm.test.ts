import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts-import-alias-paths-with-baseurl-esm', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    packageJson: {
      dependencies: {
        typescript: '5.9.3',
      },
      type: 'module',
    },
  })

  it('should support import alias paths with baseUrl (ESM)', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('foobar')
  })
})
