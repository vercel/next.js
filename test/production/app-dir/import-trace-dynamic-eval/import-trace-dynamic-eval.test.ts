import { nextBuild } from 'next-test-utils'

describe('import trace dynamic eval', () => {
  it("should show the user's import trace", async () => {
    const output = await nextBuild(__dirname, [], {
      stderr: true,
    })
    expect(output.code).toBe(1)
    expect(output.stderr).toMatchInlineSnapshot(`
      "Failed to compile.

      ./lib/foo.ts
      Dynamic Code Evaluation (e. g. 'eval', 'new Function', 'WebAssembly.compile') not allowed in Edge Runtime
      Learn More: https://nextjs.org/docs/messages/dynamic-code-evaluation-error

      The error was caused by importing 'ajv/dist/ajv.js' in './lib/foo.ts'.

      Import trace for requested module:
        ./lib/foo.ts
        ./middleware.ts


      > Build failed because of webpack errors
      "
    `)
  })
})
