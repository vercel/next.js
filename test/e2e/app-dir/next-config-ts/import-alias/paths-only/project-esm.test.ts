import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts - import alias paths only (project ESM)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    packageJson: {
      type: 'module',
    },
    tsconfig: {
      compilerOptions: {
        paths: {
          '@/*': ['./src/*'], // path should be relative when baseUrl is not set
        },
      },
    },
  })

  it('should support import alias paths only (project ESM)', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('foo')
  })
})
