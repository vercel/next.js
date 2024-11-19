import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts - import alias paths with baseUrl (project CJS)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    tsconfig: {
      compilerOptions: {
        baseUrl: '.',
        paths: {
          '@/*': ['src/*'], // path can be absolute when baseUrl is set
        },
      },
    },
  })

  it('should support import alias paths with baseUrl (project CJS)', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('foobar')
  })
})
