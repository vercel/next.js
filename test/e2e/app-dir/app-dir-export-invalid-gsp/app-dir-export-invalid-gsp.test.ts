import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// These tests don't need a browser: in production mode the error is emitted
// by `next build`, and in dev mode it is logged to the terminal when the
// dynamic route is requested. Each case runs against its own isolated
// Next.js instance so the cases stay independent.
function runTest({
  gspReturnStatement,
  expectedErrMsg,
  notExpectedErrMsg,
}: {
  // Replaces the `return []` statement in the fixture's
  // `generateStaticParams`. When omitted, the fixture is used as-is.
  gspReturnStatement?: string
  expectedErrMsg: { dev: string; build: string }
  // Asserted to be absent from the build output, to guard against a
  // misleading error being reported for the scenario.
  notExpectedErrMsg?: string
}) {
  const { next, skipped, isNextDev } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    skipStart: true,
  })
  if (skipped) {
    return
  }

  beforeAll(async () => {
    if (gspReturnStatement) {
      await next.patchFile('app/another/[slug]/page.tsx', (content) =>
        content.replace('return []', gspReturnStatement)
      )
    }

    if (isNextDev) {
      await next.start()
    }
  })

  it('should fail with an error describing the invalid return value', async () => {
    if (isNextDev) {
      await retry(async () => {
        await next.fetch('/another/first')
        expect(next.cliOutput).toContain(expectedErrMsg.dev)
      })
    } else {
      const { exitCode, cliOutput } = await next.build()
      expect(cliOutput).toContain(expectedErrMsg.build)
      if (notExpectedErrMsg) {
        expect(cliOutput).not.toContain(notExpectedErrMsg)
      }
      expect(exitCode).toBe(1)
    }
  })
}

describe('app-dir-export-invalid-gsp', () => {
  describe('should error when generateStaticParams returns an empty array', () => {
    runTest({
      expectedErrMsg: {
        dev: 'Page "/another/[slug]/page" is missing param "/another/first" in "generateStaticParams()", which is required with "output: export" config.',
        build:
          'Page "/another/[slug]" has "generateStaticParams()" but it returned an empty array [] with no params, so it cannot be used with "output: export" config. "generateStaticParams()" must return a non-empty array of params. See more info here: https://nextjs.org/docs/messages/generate-static-params-export',
      },
    })
  })

  describe('should error when generateStaticParams returns params that are missing the required params', () => {
    runTest({
      gspReturnStatement: [
        `// @ts-expect-error -- deliberately return a wrong param name: the type error is suppressed so the runtime behavior being tested here is what fails the build`,
        `  return [{ id: 'foo' }]`,
      ].join('\n'),
      expectedErrMsg: {
        dev: 'Page "/another/[slug]/page" is missing param "/another/first" in "generateStaticParams()", which is required with "output: export" config.',
        build:
          'Page "/another/[slug]" has "generateStaticParams()" but it did not provide the required params (slug), so it cannot be used with "output: export" config. See more info here: https://nextjs.org/docs/messages/generate-static-params-export',
      },
      // The params were not empty, so the empty-array error must not be
      // reported for this scenario.
      notExpectedErrMsg: 'returned an empty array',
    })
  })

  describe('should error when generateStaticParams returns a non-array value', () => {
    const expectedErrMsg =
      'Invalid value returned from "generateStaticParams" in "/another/[slug]". Expected an array of params objects, e.g. [{ slug: \'...\' }], received object. See more info here: https://nextjs.org/docs/app/api-reference/functions/generate-static-params#returns'

    runTest({
      gspReturnStatement: [
        `// @ts-expect-error -- deliberately return a non-array value: the type error is suppressed so the runtime validation being tested here is what fails the build`,
        `  return { slug: 'first' }`,
      ].join('\n'),
      expectedErrMsg: { dev: expectedErrMsg, build: expectedErrMsg },
    })
  })
})
