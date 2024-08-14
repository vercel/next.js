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
          "./app/global.scss.css:79:5
          Parsing css source code failed

          Unexpected token Ident("path") at [project]/app/global.scss.css:0:884"
        `)
      })
    })
  })
})
