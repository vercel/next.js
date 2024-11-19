import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts - import alias paths only (next.config.mts)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    tsconfig: {
      compilerOptions: {
        paths: {
          '@/*': ['./src/*'], // path should be relative when baseUrl is not set
        },
      },
    },
  })

  beforeAll(async () => {
    await next.renameFile('next.config.ts', 'next.config.mts')
    await next.start()
  })

  it('should support import alias paths only (next.config.mts)', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('foo')
  })
})
