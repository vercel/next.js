import { nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'

describe('app-dir - app routes errors', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  describe('bad lowercase exports', () => {
    it.each([
      ['get'],
      ['head'],
      ['options'],
      ['post'],
      ['put'],
      ['delete'],
      ['patch'],
    ])(
      'should print an error when using lowercase %p in dev',
      async (method: string) => {
        await next.fetch('/lowercase/' + method)

        await check(() => {
          expect(next.cliOutput).toContain(
            `Detected lowercase method '${method}' in`
          )
          expect(next.cliOutput).toContain(
            `Export the uppercase '${method.toUpperCase()}' method name to fix this error.`
          )
          expect(next.cliOutput).toMatch(
            /Detected lowercase method '.+' in '.+\/route\.js'\. Export the uppercase '.+' method name to fix this error\./
          )
          return 'yes'
        }, 'yes')
      }
    )
  })
})
