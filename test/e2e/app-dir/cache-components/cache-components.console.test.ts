import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import stripAnsi from 'strip-ansi'

describe('cache-components', () => {
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
           at consoleCalls (app/console/page.tsx:5:17)
           at ConsolePage (app/console/page.tsx:20:3)
       [0m [90m 3 |[39m   console[33m.[39mlog([32m'/console: This is a console page'[39m)
        [90m 4 |[39m   console[33m.[39mwarn([32m'/console: not a template'[39m[33m,[39m { foo[33m:[39m [32m'just-some-object'[39m })
       [31m[1m>[22m[39m[90m 5 |[39m   console[33m.[39merror([36mnew[39m [33mError[39m([32m'/console: test'[39m))
        [90m   |[39m                 [31m[1m^[22m[39m
        [90m 6 |[39m   console[33m.[39massert(
        [90m 7 |[39m     [36mfalse[39m[33m,[39m
        [90m 8 |[39m     [32m'/console: This is an assert message with a %s'[39m[33m,[39m[0m
       Assertion failed: /console: This is an assert message with a template
       /console: template(one: one, two: two)
       /console: This is a console page
       /console: not a template { foo: [32m'just-some-object'[39m }
       Error: /console: test
           at consoleCalls (app/console/page.tsx:5:17)
           at cachedConsoleCalls (app/console/page.tsx:16:3)
           at eval (../../../src/server/use-cache/use-cache-wrapper.ts:430:51)
       [0m [90m 3 |[39m   console[33m.[39mlog([32m'/console: This is a console page'[39m)
        [90m 4 |[39m   console[33m.[39mwarn([32m'/console: not a template'[39m[33m,[39m { foo[33m:[39m [32m'just-some-object'[39m })
       [31m[1m>[22m[39m[90m 5 |[39m   console[33m.[39merror([36mnew[39m [33mError[39m([32m'/console: test'[39m))
        [90m   |[39m                 [31m[1m^[22m[39m
        [90m 6 |[39m   console[33m.[39massert(
        [90m 7 |[39m     [36mfalse[39m[33m,[39m
        [90m 8 |[39m     [32m'/console: This is an assert message with a %s'[39m[33m,[39m[0m
       Assertion failed: /console: This is an assert message with a template
       [0m[7m Cache [0m /console: template(one: one, two: two)
       [0m[7m Cache [0m /console: This is a console page
       [0m[7m Cache [0m /console: not a template { foo: [32m'just-some-object'[39m }
       [0m[7m Cache [0m  Error: /console: test
           at consoleCalls (app/console/page.tsx:5:17)
           at cachedConsoleCalls (app/console/page.tsx:16:3)
       [0m [90m 3 |[39m   console[33m.[39mlog([32m'/console: This is a console page'[39m)
        [90m 4 |[39m   console[33m.[39mwarn([32m'/console: not a template'[39m[33m,[39m { foo[33m:[39m [32m'just-some-object'[39m })
       [31m[1m>[22m[39m[90m 5 |[39m   console[33m.[39merror([36mnew[39m [33mError[39m([32m'/console: test'[39m))
        [90m   |[39m                 [31m[1m^[22m[39m
        [90m 6 |[39m   console[33m.[39massert(
        [90m 7 |[39m     [36mfalse[39m[33m,[39m
        [90m 8 |[39m     [32m'/console: This is an assert message with a %s'[39m[33m,[39m[0m {
         environmentName: [32m'Cache'[39m
       }
       Assertion failed: [0m[7m Cache [0m /console: This is an assert message with a template
       [0m[7m Cache [0m Assertion failed: /console: This is an assert message with a template
       [2m/console: template(one: one, two: two)[22m[2m[22m
       [2m/console: This is a console page[22m[2m[22m
       [2m/console: not a template { foo: [32m'just-some-object'[39m }[22m[2m[22m
       [2mError: /console: test
           at consoleCalls (app/console/page.tsx:5:17)
           at ConsolePage (app/console/page.tsx:20:3)
       [0m [90m 3 |[39m   console[33m.[39mlog([32m'/console: This is a console page'[39m)
        [90m 4 |[39m   console[33m.[39mwarn([32m'/console: not a template'[39m[33m,[39m { foo[33m:[39m [32m'just-some-object'[39m })
       [31m[1m>[22m[39m[90m 5 |[39m   console[33m.[39merror([36mnew[39m [33mError[39m([32m'/console: test'[39m))
        [90m   |[39m                 [31m[1m^[22m[39m
        [90m 6 |[39m   console[33m.[39massert(
        [90m 7 |[39m     [36mfalse[39m[33m,[39m
        [90m 8 |[39m     [32m'/console: This is an assert message with a %s'[39m[33m,[39m[0m[22m[2m[22m
       [2mAssertion failed: [2m/console: This is an assert message with a template[22m[2m[2m[22m[2m[22m[2m[22m
       [2m[0m[7m Cache [0m [2m/console: template(one: one, two: two)[22m[2m[22m
       [2m[0m[7m Cache [0m [2m/console: This is a console page[22m[2m[22m
       [2m[0m[7m Cache [0m [2m/console: not a template { foo: [32m'just-some-object'[39m }[22m[2m[22m
       [2m[0m[7m Cache [0m [2m Error: /console: test
           at consoleCalls (app/console/page.tsx:5:17)
           at cachedConsoleCalls (app/console/page.tsx:16:3)
       [0m [90m 3 |[39m   console[33m.[39mlog([32m'/console: This is a console page'[39m)
        [90m 4 |[39m   console[33m.[39mwarn([32m'/console: not a template'[39m[33m,[39m { foo[33m:[39m [32m'just-some-object'[39m })
       [31m[1m>[22m[39m[90m 5 |[39m   console[33m.[39merror([36mnew[39m [33mError[39m([32m'/console: test'[39m))
        [90m   |[39m                 [31m[1m^[22m[39m
        [90m 6 |[39m   console[33m.[39massert(
        [90m 7 |[39m     [36mfalse[39m[33m,[39m
        [90m 8 |[39m     [32m'/console: This is an assert message with a %s'[39m[33m,[39m[0m {
         environmentName: [32m'Cache'[39m
       }[22m[2m[22m
       [2mAssertion failed: [2m[0m[7m Cache [0m [2m/console: This is an assert message with a template[22m[2m[2m[22m[2m[22m[2m[22m
       [2m[0m[7m Cache [0m [2mAssertion failed: /console: This is an assert message with a template[22m[2m[22m
       [2m/console: template(one: one, two: two)[22m[2m[22m
       [2m/console: This is a console page[22m[2m[22m
       [2m/console: not a template { foo: [32m'just-some-object'[39m }[22m[2m[22m
       [2mError: /console: test
           at consoleCalls (app/console/page.tsx:5:17)
           at ConsolePage (app/console/page.tsx:20:3)
       [0m [90m 3 |[39m   console[33m.[39mlog([32m'/console: This is a console page'[39m)
        [90m 4 |[39m   console[33m.[39mwarn([32m'/console: not a template'[39m[33m,[39m { foo[33m:[39m [32m'just-some-object'[39m })
       [31m[1m>[22m[39m[90m 5 |[39m   console[33m.[39merror([36mnew[39m [33mError[39m([32m'/console: test'[39m))
        [90m   |[39m                 [31m[1m^[22m[39m
        [90m 6 |[39m   console[33m.[39massert(
        [90m 7 |[39m     [36mfalse[39m[33m,[39m
        [90m 8 |[39m     [32m'/console: This is an assert message with a %s'[39m[33m,[39m[0m[22m[2m[22m
       [2mAssertion failed: [2m/console: This is an assert message with a template[22m[2m[2m[22m[2m[22m[2m[22m
       [2m[0m[7m Cache [0m [2m/console: template(one: one, two: two)[22m[2m[22m
       [2m[0m[7m Cache [0m [2m/console: This is a console page[22m[2m[22m
       [2m[0m[7m Cache [0m [2m/console: not a template { foo: [32m'just-some-object'[39m }[22m[2m[22m
       [2m[0m[7m Cache [0m [2m Error: /console: test
           at consoleCalls (app/console/page.tsx:5:17)
           at cachedConsoleCalls (app/console/page.tsx:16:3)
       [0m [90m 3 |[39m   console[33m.[39mlog([32m'/console: This is a console page'[39m)
        [90m 4 |[39m   console[33m.[39mwarn([32m'/console: not a template'[39m[33m,[39m { foo[33m:[39m [32m'just-some-object'[39m })
       [31m[1m>[22m[39m[90m 5 |[39m   console[33m.[39merror([36mnew[39m [33mError[39m([32m'/console: test'[39m))
        [90m   |[39m                 [31m[1m^[22m[39m
        [90m 6 |[39m   console[33m.[39massert(
        [90m 7 |[39m     [36mfalse[39m[33m,[39m
        [90m 8 |[39m     [32m'/console: This is an assert message with a %s'[39m[33m,[39m[0m {
         environmentName: [32m'Cache'[39m
       }[22m[2m[22m
       [2mAssertion failed: [2m[0m[7m Cache [0m [2m/console: This is an assert message with a template[22m[2m[2m[22m[2m[22m[2m[22m
       [2m[0m[7m Cache [0m [2mAssertion failed: /console: This is an assert message with a template[22m[2m[22m"
      `)
      await expect(browser).toDisplayCollapsedRedbox(`
       [
         {
           "description": "/console: test",
           "environmentLabel": "Prerender",
           "label": "Console Error",
           "source": "app/console/page.tsx (5:17) @ consoleCalls
       > 5 |   console.error(new Error('/console: test'))
           |                 ^",
           "stack": [
             "consoleCalls app/console/page.tsx (5:17)",
             "ConsolePage app/console/page.tsx (20:3)",
             "ConsolePage <anonymous>",
           ],
         },
         {
           "description": "/console: test",
           "environmentLabel": "Cache",
           "label": "Console Error",
           "source": "app/console/page.tsx (5:17) @ consoleCalls
       > 5 |   console.error(new Error('/console: test'))
           |                 ^",
           "stack": [
             "consoleCalls app/console/page.tsx (5:17)",
             "cachedConsoleCalls app/console/page.tsx (16:3)",
             "JSON.parse <anonymous>",
             "JSON.parse <anonymous>",
             "ConsolePage <anonymous>",
           ],
         },
       ]
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
            6
          : 3
      )
    }
  })
})
