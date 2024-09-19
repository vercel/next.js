import { nextTestSetup } from 'e2e-utils'
import { getRedboxSource } from 'next-test-utils'

describe('app dir - css', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    dependencies: {
      sass: 'latest',
    },
  })

  if (skipped) {
    return
  }

  describe('css support', () => {
    // css-loader does not report an error for this case
    ;(process.env.TURBOPACK ? describe : describe.skip)(
      'error handling',
      () => {
        it('should report human-readable error message for css', async () => {
          const browser = await next.browser('/css-error')

          const source = await getRedboxSource(browser)

          expect(source).toMatchInlineSnapshot()
        })
      }
    )
  })
})
