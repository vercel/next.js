import { nextTestSetup } from 'e2e-utils'
import { outdent } from 'outdent'
import { assertHasRedbox, getRedboxDescription } from 'next-test-utils'

describe('interceptors-force-static', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
    skipStart: process.env.NEXT_TEST_MODE !== 'dev',
  })

  describe('with `dynamic = "force-static"`', () => {
    if (isNextStart) {
      it('should fail the build with an error', async () => {
        const { cliOutput } = await next.build()

        expect(cliOutput).toInclude(outdent`
          Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error
  
          Error: Route / with \`dynamic = "force-static"\` couldn't be rendered statically because it used an interceptor. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering
        `)
      })
    } else {
      it('should show an error', async () => {
        const browser = await next.browser('/')

        await assertHasRedbox(browser)

        expect(await getRedboxDescription(browser)).toContain(
          `Route / with \`dynamic = "force-static"\` couldn't be rendered statically because it used an interceptor`
        )
      })
    }
  })
})
