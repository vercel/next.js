import { nextTestSetup } from 'e2e-utils'

describe('TypeScript with error handling options', () => {
  describe('production mode', () => {
    const { next, isNextStart } = nextTestSetup({
      files: __dirname,
      skipStart: true,
    })

    if (!isNextStart) {
      it('skipped for non-start mode', () => {})
      return
    }

    for (const incremental of [false, true]) {
      for (const ignoreBuildErrors of [false, true]) {
        describe(`ignoreBuildErrors: ${ignoreBuildErrors}`, () => {
          let originalNextConfig: string
          let originalTsConfig: string

          beforeAll(async () => {
            originalNextConfig = await next
              .readFile('next.config.js')
              .catch(() => '')
            originalTsConfig = await next.readFile('tsconfig.json')
            const nextConfig = {
              typescript: { ignoreBuildErrors },
            }
            await next.patchFile(
              'next.config.js',
              'module.exports = ' + JSON.stringify(nextConfig)
            )
            const tsconfig = JSON.parse(originalTsConfig)
            await next.patchFile(
              'tsconfig.json',
              JSON.stringify(
                {
                  ...tsconfig,
                  compilerOptions: {
                    ...tsconfig.compilerOptions,
                    incremental,
                  },
                },
                null,
                2
              )
            )
          })
          afterAll(async () => {
            if (originalNextConfig) {
              await next.patchFile('next.config.js', originalNextConfig)
            } else {
              await next.deleteFile('next.config.js')
            }
            await next.patchFile('tsconfig.json', originalTsConfig)
          })

          it(
            (ignoreBuildErrors
              ? 'Next builds the application despite type errors'
              : 'Next fails to build the application despite type errors') +
              (incremental
                ? ' in incremental mode'
                : ' without incremental mode'),
            async () => {
              await next.build()

              if (ignoreBuildErrors) {
                expect(next.cliOutput).toContain('Compiled successfully')
                expect(next.cliOutput).not.toContain('Failed to type check.')
                expect(next.cliOutput).not.toContain(
                  "not assignable to type 'boolean'"
                )
              } else {
                expect(next.cliOutput).not.toContain('Compiled successfully')
                expect(next.cliOutput).toContain('Failed to type check.')
                expect(next.cliOutput).toContain('./pages/index.tsx:2:31')
                expect(next.cliOutput).toContain(
                  "not assignable to type 'boolean'"
                )
              }
            }
          )
        })
      }
    }
  })
})
