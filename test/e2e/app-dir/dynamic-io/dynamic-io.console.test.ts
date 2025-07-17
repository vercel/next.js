import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import stripAnsi from 'strip-ansi'

describe('dynamic-io', () => {
  const { isNextDev, isTurbopack, next, skipped } = nextTestSetup({
    env: {
      FORCE_COLOR: '1',
    },
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('dims console calls during prospective rendering', async () => {
    const browser = await next.browser('/console', {})

    if (isNextDev) {
      await retry(() => {
        expect(stripAnsi(next.cliOutput)).toContain('GET /console 200')
      })

      // do not strip ANSI codes here since we're explicitly testing coloring.
      const cliOutputFromPage = next.cliOutput.match(
        /Compiled \/console[^\n]+\n(.*)\n GET \/console /s
      )[1]

      expect(cliOutputFromPage).toMatchInlineSnapshot(`
       "/console: template(one: one, two: two)
       /console: This is a console page
       /console: not a template { foo: [32m'just-some-object'[39m }
       Error: /console: test
           at ConsolePage (app/console/page.tsx:5:17)
       [0m [90m 3 |[39m   console[33m.[39mlog([32m'/console: This is a console page'[39m)
        [90m 4 |[39m   console[33m.[39mwarn([32m'/console: not a template'[39m[33m,[39m { foo[33m:[39m [32m'just-some-object'[39m })
       [31m[1m>[22m[39m[90m 5 |[39m   console[33m.[39merror([36mnew[39m [33mError[39m([32m'/console: test'[39m))
        [90m   |[39m                 [31m[1m^[22m[39m
        [90m 6 |[39m   console[33m.[39massert(
        [90m 7 |[39m     [36mfalse[39m[33m,[39m
        [90m 8 |[39m     [32m'/console: This is an assert message with a %s'[39m[33m,[39m[0m
       Assertion failed: /console: This is an assert message with a template
       [2;38;2;124;124;124m/console: template(one: one, two: two)[0m
       [2;38;2;124;124;124m/console: This is a console page[0m
       [2;38;2;124;124;124m/console: not a template[0m { foo: [32m'just-some-object'[39m }
       [2;38;2;124;124;124mError: /console: test
           at ConsolePage (app/console/page.tsx:5:17)
         3 |   console.log('/console: This is a console page')
         4 |   console.warn('/console: not a template', { foo: 'just-some-object' })
       > 5 |   console.error(new Error('/console: test'))
           |                 ^
         6 |   console.assert(
         7 |     false,
         8 |     '/console: This is an assert message with a %s',[0m
       [2;38;2;124;124;124mAssertion failed: [2;38;2;124;124;124m/console: This is an assert message with a template[0m[0m
       [2;38;2;124;124;124m/console: template(one: one, two: two)[0m
       [2;38;2;124;124;124m/console: This is a console page[0m
       [2;38;2;124;124;124m/console: not a template[0m { foo: [32m'just-some-object'[39m }
       [2;38;2;124;124;124mError: /console: test
           at ConsolePage (app/console/page.tsx:5:17)
         3 |   console.log('/console: This is a console page')
         4 |   console.warn('/console: not a template', { foo: 'just-some-object' })
       > 5 |   console.error(new Error('/console: test'))
           |                 ^
         6 |   console.assert(
         7 |     false,
         8 |     '/console: This is an assert message with a %s',[0m
       [2;38;2;124;124;124mAssertion failed: [2;38;2;124;124;124m/console: This is an assert message with a template[0m[0m"
      `)
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "description": "/console: test",
         "environmentLabel": "Prerender",
         "label": "Console Error",
         "source": "app/console/page.tsx (5:17) @ ConsolePage
       > 5 |   console.error(new Error('/console: test'))
           |                 ^",
         "stack": [
           "ConsolePage app/console/page.tsx (5:17)",
           "ConsolePage <anonymous>",
         ],
       }
      `)
    } else {
      // prewarm + render
      // Neither is dimmed in production
      const pageInvocations = Array.from(
        next.cliOutput.matchAll(/\/console: This is a console page/g)
      )
      expect(pageInvocations).toHaveLength(
        isTurbopack
          ? // TODO: Why?
            4
          : 2
      )
    }
  })
})
