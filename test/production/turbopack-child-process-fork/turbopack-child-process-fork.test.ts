import { nextTestSetup } from 'e2e-utils'

describe('turbopack child_process.fork path tracing', () => {
  const { next, isTurbopack, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })
  if (skipped) return

  // Regression for https://github.com/vercel/next.js/issues/97952
  // Turbopack previously resolved fork()'s path argument as a module request,
  // so absolute / path.join(cwd, …) paths failed the build.
  ;(isTurbopack ? it : it.skip)(
    'should build when fork() receives a cwd-joined worker path',
    async () => {
      const { exitCode, cliOutput } = await next.build()
      expect(cliOutput).not.toContain("Can't resolve")
      expect(exitCode).toBe(0)
    }
  )
})
