import { nextTestSetup } from 'e2e-utils'
import { assertHasRedbox, getRedboxSource } from 'next-test-utils'

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

  describe('sass support', () => {
    ;(process.env.TURBOPACK ? describe : describe.skip)(
      'error handling',
      () => {
        it('should use original source points for sass errors', async () => {
          const browser = await next.browser('/sass-error')

          await assertHasRedbox(browser, {
            pageResponseCode: 500,
          })
          const source = await getRedboxSource(browser)

          // css-loader does not report an error for this case
          expect(source).toMatchInlineSnapshot(`
            "./app/global.scss.css:45:1
            Parsing css source code failed
              43 | }
              44 |
            > 45 | input.defaultCheckbox::before path {
                 | ^
              46 |   fill: currentColor;
              47 | }
              48 |

            Pseudo-elements like '::before' or '::after' can't be followed by selectors like 'Ident("path")' at [project]/app/global.scss.css:0:884"
          `)
        })
      }
    )
  })
})
