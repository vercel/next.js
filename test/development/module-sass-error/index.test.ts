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

  describe('module sass support', () => {
    describe('error handling', () => {
      it('should use original source points for module sass errors', async () => {
        const browser = await next.browser('/sass-error')

        await assertHasRedbox(browser)
        const source = await getRedboxSource(browser)

        expect(source).toMatchInlineSnapshot(`
            "./app/global.module.scss:10:7
            Parsing css source code failed
               8 |   &.children {
               9 |     :global {
            > 10 |       .inner {
                 |       ^
              11 |         background-color: #f00;
              12 |       }
              13 |     }

            Ambiguous CSS module class not supported at [project]/app/global.module.scss.module.css:0:122"
          `)
      })
    })
  })
})
