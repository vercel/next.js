import { nextTestSetup } from 'e2e-utils'

describe('tsconfig-no-relative-resolve', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  // Next.js should only use the application root tsconfig.json file and not files relative to the file being compiled.
  it('should fail to build', async () => {
    const { exitCode, cliOutput } = await next.build()
    expect(exitCode).toBe(0)
    expect(cliOutput).not.toContain('non-existent-package')
  })
})
