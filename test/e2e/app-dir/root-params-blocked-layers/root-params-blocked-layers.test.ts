import { nextTestSetup, FileRef } from 'e2e-utils'
import { join } from 'path'

const fixturesDir = join(__dirname, 'fixtures')
const baseDir = join(fixturesDir, 'base')

function baseFilesWith(extraFiles: Record<string, FileRef>) {
  return {
    app: new FileRef(join(baseDir, 'app')),
    'next.config.js': new FileRef(join(baseDir, 'next.config.js')),
    ...extraFiles,
  }
}

describe('next/root-params blocked layers', () => {
  const expectedError =
    "'next/root-params' can only be used inside the App Directory."

  describe('middleware', () => {
    const { next } = nextTestSetup({
      files: baseFilesWith({
        'middleware.ts': new FileRef(
          join(fixturesDir, 'middleware', 'middleware.ts')
        ),
      }),
      skipStart: true,
      skipDeployment: true,
    })

    it('should error when next/root-params is imported from middleware', async () => {
      const { exitCode, cliOutput } = await next.build()
      expect(exitCode).toBe(1)
      expect(cliOutput).toContain(expectedError)
    })
  })

  describe('instrumentation', () => {
    const { next } = nextTestSetup({
      files: baseFilesWith({
        'instrumentation.ts': new FileRef(
          join(fixturesDir, 'instrumentation', 'instrumentation.ts')
        ),
      }),
      skipStart: true,
      skipDeployment: true,
    })

    it('should error when next/root-params is imported from instrumentation', async () => {
      const { exitCode, cliOutput } = await next.build()
      expect(exitCode).toBe(1)
      expect(cliOutput).toContain(expectedError)
    })
  })
})
