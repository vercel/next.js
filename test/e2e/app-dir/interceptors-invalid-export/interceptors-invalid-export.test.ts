import { nextTestSetup } from 'e2e-utils'
import { outdent } from 'outdent'
import { assertHasRedbox, getRedboxDescription } from 'next-test-utils'

describe('interceptors-invalid-export', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
    skipStart: process.env.NEXT_TEST_MODE !== 'dev',
  })

  describe('with an invalid export', () => {
    if (isNextStart) {
      it('should fail the build with an error', async () => {
        const { cliOutput } = await next.build()

        expect(cliOutput).toInclude(outdent`
          Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error

          Error: The default export in "app/interceptor.ts" is not a function.
        `)
      })
    } else {
      it('should show an error', async () => {
        const browser = await next.browser('/')

        await assertHasRedbox(browser)

        expect(await getRedboxDescription(browser)).toContain(
          `Error: The default export in "app/interceptor.ts" is not a function.`
        )
      })
    }
  })
})
