import { nextTestSetup } from 'e2e-utils'

describe('jsconfig paths wildcard', () => {
  describe('default behavior', () => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    it('should resolve a wildcard alias', async () => {
      const $ = await next.render$('/wildcard-alias')
      expect($('body').text()).toMatch(/world/)
    })
  })

  describe('without baseUrl', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      overrideFiles: {
        'jsconfig.json': JSON.stringify(
          {
            compilerOptions: {
              paths: {
                '*': ['./node_modules/*'],
              },
            },
            exclude: ['node_modules', '**/*.test.ts', '**/*.test.tsx'],
          },
          null,
          2
        ),
      },
    })

    it('should resolve a wildcard alias', async () => {
      const $ = await next.render$('/wildcard-alias')
      expect($('body').text()).toMatch(/world/)
    })
  })
})
