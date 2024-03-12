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
    await next.start()

    expect(next.cliOutput).not.toContain(
      `Dynamic Code Evaluation (e. g. 'eval', 'new Function', 'WebAssembly.compile') not allowed in Edge Runtime`
    )

    await next.stop()
  })

  it("should show the user's import trace", async () => {
    await next.patchFile(
      'middleware.js',
      `
      import { foo } from './lib/foo'
      export function middleware() {
        foo()
      }`
    )
    const output = await next.build()
    expect(output.exitCode).toBe(1)
    expect(output.cliOutput.split('\n').slice(3).join('\n'))
      .toMatchInlineSnapshot(`
      "   Creating an optimized production build ...
      Failed to compile.

      ./lib/foo.js
      Dynamic Code Evaluation (e. g. 'eval', 'new Function', 'WebAssembly.compile') not allowed in Edge Runtime 
      Used by bar
      Learn More: https://nextjs.org/docs/messages/edge-dynamic-code-evaluation

      The error was caused by importing 'foo/index.js' in './lib/foo.js'.

      Import trace for requested module:
        ./lib/foo.js
        ./middleware.js


      > Build failed because of webpack errors
      "
    `)
  })
})
