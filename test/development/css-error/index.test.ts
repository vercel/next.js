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
        it('should report human-readable error message for wrong pseudo class', async () => {
          const browser = await next.browser('/css-error-1')

          const source = await getRedboxSource(browser)

          expect(source).toMatchInlineSnapshot()
        })

        it('should report human-readable error message for wrong global class', async () => {
          const browser = await next.browser('/css-error-2')

          const source = await getRedboxSource(browser)

          expect(source).toMatchInlineSnapshot()
        })

        it('should report human-readable error message for wrong css module', async () => {
          const browser = await next.browser('/css-error-3')

          const source = await getRedboxSource(browser)

          expect(source).toMatchInlineSnapshot()
        })
      }
    )
  })
})
