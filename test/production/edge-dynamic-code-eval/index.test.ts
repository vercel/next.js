import { nextTestSetup } from 'e2e-utils'

describe('Dynamic Code Evaluation (DCE)', () => {
  const { next } = nextTestSetup({
    skipStart: true,
    dependencies: { 'function-bind': 'latest' },
    files: __dirname,
  })

  // This test is basically for https://github.com/vercel/next.js/discussions/51910
  // to make sure that some libs that we know are using `eval` but don't break
  // because it will never run into that condition, but still can't to be DCE'd.
  it('should not fail when "function-bind" package is used', async () => {
    const { exitCode, cliOutput } = await next.build()
    expect(exitCode).toBe(0)
    expect(cliOutput).not.toContain(
      `Dynamic Code Evaluation (e. g. 'eval', 'new Function', 'WebAssembly.compile') not allowed in Edge Runtime`
    )
  })
  ;(process.env.IS_TURBOPACK_TEST ? it.skip : it)(
    "should show the user's import trace",
    async () => {
      await next.patchFile(
        'middleware.js',
        `
      import { foo } from './lib/foo'
      export function middleware() {
        foo()
      }`
      )
      const { exitCode, cliOutput } = await next.build()
      // eslint-disable-next-line jest/no-standalone-expect
      expect(exitCode).toBe(1)

      // eslint-disable-next-line jest/no-standalone-expect
      expect(cliOutput).toContain(`./lib/foo.js
Dynamic Code Evaluation (e. g. 'eval', 'new Function', 'WebAssembly.compile') not allowed in Edge Runtime 
Used by bar`)

      // eslint-disable-next-line jest/no-standalone-expect
      expect(cliOutput).toContain(`Import trace for requested module:
  ./lib/foo.js
  ./middleware.js`)
    }
  )
})
