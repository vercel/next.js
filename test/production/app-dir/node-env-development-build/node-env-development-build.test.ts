import { nextTestSetup } from 'e2e-utils'

const hint = `The build failed while "NODE_ENV" was set to "development".`
const remedy = `Unset "NODE_ENV" or set it to "production" when running \`next build\`.`
const docsLink = 'https://nextjs.org/docs/messages/non-standard-node-env'
const intentionalFailure = 'intentional prerender failure'
const prerenderFailureEnv = { TEST_PRERENDER_FAILURE: 'true' }

function countOccurrences(haystack: string, needle: string) {
  return haystack.split(needle).length - 1
}

describe('node-env-development-build', () => {
  describe('NODE_ENV=development', () => {
    // The test harness only forwards `NODE_ENV` from the fixture env, not from
    // `next.build({ env })`.
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
      env: { NODE_ENV: 'development' },
    })

    it('explains that NODE_ENV caused the prerender failure', async () => {
      const { exitCode, cliOutput } = await next.build()

      expect(exitCode).not.toBe(0)
      expect(cliOutput).toContain('Error occurred prerendering page')
      expect(countOccurrences(cliOutput, hint)).toBe(1)
      expect(cliOutput).toContain(remedy)
      expect(cliOutput).toContain(docsLink)
    })

    it('explains the failure when prerenderEarlyExit is disabled', async () => {
      const { exitCode, cliOutput } = await next.build({
        env: { TEST_PRERENDER_EARLY_EXIT: 'false' },
      })

      expect(exitCode).not.toBe(0)
      expect(cliOutput).toContain('Export encountered errors on')
      expect(countOccurrences(cliOutput, hint)).toBe(1)
      expect(cliOutput).toContain(remedy)
    })

    it('does not show the hint for a failed --debug-prerender build', async () => {
      const { exitCode, cliOutput } = await next.build({
        args: ['--debug-prerender'],
        env: prerenderFailureEnv,
      })

      expect(exitCode).not.toBe(0)
      expect(cliOutput).toContain(intentionalFailure)
      expect(cliOutput).not.toContain(hint)
    })

    it('does not show the hint for a failed allowDevelopmentBuild build', async () => {
      const { exitCode, cliOutput } = await next.build({
        env: {
          ...prerenderFailureEnv,
          TEST_ALLOW_DEVELOPMENT_BUILD: 'true',
        },
      })

      expect(exitCode).not.toBe(0)
      expect(cliOutput).toContain(intentionalFailure)
      expect(cliOutput).not.toContain(hint)
    })
  })

  describe('NODE_ENV=production', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
      env: { NODE_ENV: 'production' },
    })

    it('builds without the hint', async () => {
      const { exitCode, cliOutput } = await next.build()

      expect(exitCode).toBe(0)
      expect(cliOutput).not.toContain(hint)
    })

    it('does not show the hint for an unrelated prerender failure', async () => {
      const { exitCode, cliOutput } = await next.build({
        env: prerenderFailureEnv,
      })

      expect(exitCode).not.toBe(0)
      expect(cliOutput).toContain(intentionalFailure)
      expect(cliOutput).not.toContain(hint)
    })
  })

  describe('NODE_ENV unset', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
    })

    it('does not show the hint for an unrelated prerender failure', async () => {
      const { exitCode, cliOutput } = await next.build({
        env: prerenderFailureEnv,
      })

      expect(exitCode).not.toBe(0)
      expect(cliOutput).toContain(intentionalFailure)
      expect(cliOutput).not.toContain(hint)
    })
  })
})
