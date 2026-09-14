import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts-import-alias-paths-with-baseurl-cjs', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      typescript: '5.9.3',
    },
  })

  it('should support import alias paths with baseUrl (CJS)', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('foobar')
  })
})
