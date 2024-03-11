import { NextInstance, createNext } from 'e2e-utils'

describe('import trace dynamic eval', () => {
  let next: NextInstance
  beforeAll(async () => {
    next = await createNext({
      skipStart: true,
      files: __dirname,
    })
  })
  afterAll(() => next.destroy())

  it("should show the user's import trace", async () => {
    const output = await next.build()
    expect(output.exitCode).toBe(1)
    expect(output.cliOutput).toInclude(`Failed to compile.

      ./lib/foo.ts
      Dynamic Code Evaluation (e. g. 'eval', 'new Function', 'WebAssembly.compile') not allowed in Edge Runtime 
      Used by bar
      Learn More: https://nextjs.org/docs/messages/edge-dynamic-code-evaluation

      The error was caused by importing 'foo/index.js' in './lib/foo.ts'.

      Import trace for requested module:
        ./lib/foo.ts
        ./middleware.ts


      > Build failed because of webpack errors`)
  })
})
