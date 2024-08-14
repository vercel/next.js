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

  describe('sass support', () => {
    describe('error handling', () => {
      it('should use original source points for sass errors', async () => {
        const browser = await next.browser('/sass-error')

        const source = await getRedboxSource(browser)

        expect(source).toMatchInlineSnapshot(`
          "./app/global.scss:45:1
          Parsing css source code failed
            43 | }
            44 |
          > 45 | input.defaultCheckbox::before path {
               | ^
            46 |   fill: currentColor;
            47 | }
            48 |

          Unexpected token Ident("path"); the type selector 'path' is not allowed here"
        `)
      })
    })
  })
})
