import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// These exports deliberately fail validation and cannot produce a deployment.
// @force-gate !deploy
describe('param-matching-exports', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  const layoutFile = 'app/[lang]/layout.js'
  let layout: string

  beforeAll(async () => {
    layout = await next.readFile(layoutFile)
    if (isNextDev) await next.start()
  })

  async function expectValidationError(outputStart: number, message: string) {
    if (isNextDev) {
      await next.fetch('/en/t1')
      await retry(() => {
        expect(next.cliOutput.slice(outputStart)).toContain(message)
      })
    } else {
      const { exitCode, cliOutput } = await next.build()
      expect(cliOutput).toContain(message)
      expect(exitCode).toBe(1)
    }

    expect(next.cliOutput.slice(outputStart)).not.toContain(
      'UNEXPECTED_MATCHER_EXECUTION'
    )
  }

  it.each([
    [
      'static-below',
      'unstable_paramMatching',
      'may only configure parameters defined at or above its segment',
    ],
    [
      'generated-below',
      'unstable_generateParamMatching',
      'may only configure parameters defined at or above its segment',
    ],
    [
      'static-function',
      'unstable_paramMatching',
      'Expected an object, but received function',
    ],
    [
      'generated-object',
      'unstable_generateParamMatching',
      'must export `unstable_generateParamMatching` as a function',
    ],
    [
      'generated-invalid-mode',
      'unstable_generateParamMatching',
      'Invalid mode for parameter "lang"',
    ],
    [
      'static-invalid-mode',
      'unstable_paramMatching',
      'Invalid mode for parameter "lang"',
    ],
    [
      'generated-null',
      'unstable_generateParamMatching',
      'Expected an object, but received null',
    ],
  ])(
    'rejects %s in the exporting layout',
    async (fixture, exportName, message) => {
      const outputStart = next.cliOutput.length
      await next.patchFile(
        layoutFile,
        `${layout}\nexport { ${exportName} } from '../../matchers/${fixture}'\n`
      )

      await expectValidationError(outputStart, message)
      expect(next.cliOutput.slice(outputStart)).toContain(exportName)
    }
  )

  it('rejects private caches with the same request-context error as generateStaticParams', async () => {
    const outputStart = next.cliOutput.length
    await next.patchFile(
      layoutFile,
      `${layout}\nexport { unstable_generateParamMatching } from '../../matchers/generated-private-cache'\n`
    )
    await expectValidationError(
      outputStart,
      '`"use cache: private"` needs an active request'
    )
    expect(next.cliOutput.slice(outputStart)).not.toContain(
      'Expected a WorkUnitStore'
    )
  })

  it('propagates generator failures without a next.config opt-in', async () => {
    const outputStart = next.cliOutput.length
    await next.patchFile(
      layoutFile,
      `${layout}\nexport { unstable_generateParamMatching } from '../../matchers/generated-throws'\n`
    )
    await expectValidationError(outputStart, 'MATCHER_GENERATOR_FAILURE')
  })
})
