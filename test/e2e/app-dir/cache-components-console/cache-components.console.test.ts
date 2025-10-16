import { isNextDev, nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import stripAnsi from 'strip-ansi'

// TODO(restart-on-cache-miss): cacheSignal timing changes break console log dimming/hiding tests
describe.skip('cache-components - Console Dimming - Validation', () => {
  const { next, skipped, isTurbopack } = nextTestSetup({
    env: {
      FORCE_COLOR: '1',
    },
    files: __dirname + '/fixtures/default',
    skipDeployment: true,
    skipStart: !isNextDev,
  })

  if (skipped) {
    return
  }

  it('dims console calls during prospective rendering', async () => {
    const path: string = '/console'
    if (isNextDev) {
      const browser = await next.browser(path, {})
      await retry(() => {
        expect(stripAnsi(next.cliOutput)).toContain(`GET ${path} 200`)
      })

      // do not strip ANSI codes here since we're explicitly testing coloring.
      const cliOutputFromPage = next.cliOutput.match(
        new RegExp(`Compiled ${path}[^\n]+\n(.*)`, 's')
      )[1]

      const reorderedLines = reorderLinesByBadge(cliOutputFromPage)

      expect(reorderedLines).toMatchInlineSnapshot(`
       ":::0:out::: /console: template(one: one, two: two)
       :::0:out::: /console: This is a console page. Don't match the codeframe.
       :::0:out::: /console: template(one: one, two: two)
       :::0:out::: /console: This is a console page. Don't match the codeframe.
       [0m[7m Cache [0m :::0:out::: /console: template(one: one, two: two)
       [0m[7m Cache [0m :::0:out::: /console: This is a console page. Don't match the codeframe.
       :::0:err::: /console: not a template { foo: [32m'just-some-object'[39m }
       Error: :::0:err::: /console: test
           at ConsolePage (app/console/page.tsx:<line>:<col>)
       [0m [90m 40 |[39m   })
        [90m 41 |[39m   [36mawait[39m [35m1[39m
       [31m[1m>[22m[39m[90m 42 |[39m   console[33m.[39merror([36mnew[39m [33mError[39m([32m\`\${errBadge} /console: test\`[39m))
        [90m    |[39m                 [31m[1m^[22m[39m
        [90m 43 |[39m   [36mawait[39m [35m1[39m
        [90m 44 |[39m   console[33m.[39massert(
        [90m 45 |[39m     [36mfalse[39m[33m,[39m[0m
       Assertion failed: :::0:err::: /console: This is an assert message with a template
       :::0:err::: /console: not a template { foo: [32m'just-some-object'[39m }
       Assertion failed: :::0:err::: /console: This is an assert message with a template
       [0m[7m Cache [0m :::0:err::: /console: not a template { foo: [32m'just-some-object'[39m }
       Assertion failed: [0m[7m Cache [0m :::0:err::: /console: This is an assert message with a template
       [0m[7m Cache [0m Assertion failed: :::0:err::: /console: This is an assert message with a template
       [2m:::1:out::: /console: template(one: one, two: two)[22m[2m[22m
       [2m:::1:out::: /console: This is a console page. Don't match the codeframe.[22m[2m[22m
       :::1:out::: /console: template(one: one, two: two)
       :::1:out::: /console: This is a console page. Don't match the codeframe.
       [2m[0m[7m Cache [0m [2m:::1:out::: /console: template(one: one, two: two)[22m[2m[22m
       [2m[0m[7m Cache [0m [2m:::1:out::: /console: This is a console page. Don't match the codeframe.[22m[2m[22m
       [2m:::1:err::: /console: not a template { foo: [32m'just-some-object'[39m }[22m[2m[22m
       [2mError: :::1:err::: /console: test
           at ConsolePage (app/console/page.tsx:<line>:<col>)
       [0m [90m 40 |[39m   })
        [90m 41 |[39m   [36mawait[39m [35m1[39m
       [31m[1m>[22m[39m[90m 42 |[39m   console[33m.[39merror([36mnew[39m [33mError[39m([32m\`\${errBadge} /console: test\`[39m))
        [90m    |[39m                 [31m[1m^[22m[39m
        [90m 43 |[39m   [36mawait[39m [35m1[39m
        [90m 44 |[39m   console[33m.[39massert(
        [90m 45 |[39m     [36mfalse[39m[33m,[39m[0m[22m[2m[22m
       [2mAssertion failed: [2m:::1:err::: /console: This is an assert message with a template[22m[2m[2m[22m[2m[22m[2m[22m
       :::1:err::: /console: not a template { foo: [32m'just-some-object'[39m }
       Assertion failed: :::1:err::: /console: This is an assert message with a template
       [2m[0m[7m Cache [0m [2m:::1:err::: /console: not a template { foo: [32m'just-some-object'[39m }[22m[2m[22m
       [2mAssertion failed: [2m[0m[7m Cache [0m [2m:::1:err::: /console: This is an assert message with a template[22m[2m[2m[22m[2m[22m[2m[22m
       [2m[0m[7m Cache [0m [2mAssertion failed: :::1:err::: /console: This is an assert message with a template[22m[2m[22m
       [2m:::2:out::: /console: template(one: one, two: two)[22m[2m[22m
       [2m:::2:out::: /console: This is a console page. Don't match the codeframe.[22m[2m[22m
       :::2:out::: /console: template(one: one, two: two)
       :::2:out::: /console: This is a console page. Don't match the codeframe.
       [2m[0m[7m Cache [0m [2m:::2:out::: /console: template(one: one, two: two)[22m[2m[22m
       [2m[0m[7m Cache [0m [2m:::2:out::: /console: This is a console page. Don't match the codeframe.[22m[2m[22m
       [2m:::2:err::: /console: not a template { foo: [32m'just-some-object'[39m }[22m[2m[22m
       [2mError: :::2:err::: /console: test
           at ConsolePage (app/console/page.tsx:<line>:<col>)
       [0m [90m 40 |[39m   })
        [90m 41 |[39m   [36mawait[39m [35m1[39m
       [31m[1m>[22m[39m[90m 42 |[39m   console[33m.[39merror([36mnew[39m [33mError[39m([32m\`\${errBadge} /console: test\`[39m))
        [90m    |[39m                 [31m[1m^[22m[39m
        [90m 43 |[39m   [36mawait[39m [35m1[39m
        [90m 44 |[39m   console[33m.[39massert(
        [90m 45 |[39m     [36mfalse[39m[33m,[39m[0m[22m[2m[22m
       [2mAssertion failed: [2m:::2:err::: /console: This is an assert message with a template[22m[2m[2m[22m[2m[22m[2m[22m
       :::2:err::: /console: not a template { foo: [32m'just-some-object'[39m }
       Assertion failed: :::2:err::: /console: This is an assert message with a template
       [2m[0m[7m Cache [0m [2m:::2:err::: /console: not a template { foo: [32m'just-some-object'[39m }[22m[2m[22m
       [2mAssertion failed: [2m[0m[7m Cache [0m [2m:::2:err::: /console: This is an assert message with a template[22m[2m[2m[22m[2m[22m[2m[22m
       [2m[0m[7m Cache [0m [2mAssertion failed: :::2:err::: /console: This is an assert message with a template[22m[2m[22m
       "
      `)

      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "description": ":::0:err::: /console: test",
         "environmentLabel": "Prerender",
         "label": "Console Error",
         "source": "app/console/page.tsx (42:17) @ ConsolePage
       > 42 |   console.error(new Error(\`\${errBadge} /console: test\`))
            |                 ^",
         "stack": [
           "ConsolePage app/console/page.tsx (42:17)",
           "ConsolePage <anonymous>",
         ],
       }
      `)
    } else {
      try {
        await next.build({
          env: {
            NEXT_PRIVATE_APP_PATHS: `["${path === '/' ? '' : path}/page.tsx"]`,
          },
        })
      } catch (err) {
        const error = new Error(
          'Expected build to complete successfully, but it failed'
        )
        error.cause = err
        throw error
      }
      // do not strip ANSI codes here since we're explicitly testing coloring.
      const cliOutputFromPage = next.cliOutput.match(
        /Collecting page data[^\n]+\n(.*)\n.*Finalizing page optimization /s
      )[1]

      const reorderedLines = reorderLinesByBadge(cliOutputFromPage)

      if (isTurbopack) {
        expect(reorderedLines).toMatchInlineSnapshot(`
         ":::0:out::: /console: template(one: one, two: two)
         :::0:out::: /console: This is a console page. Don't match the codeframe.
         :::0:out::: /console: template(one: one, two: two)
         :::0:out::: /console: This is a console page. Don't match the codeframe.
         :::0:err::: /console: not a template { foo: [32m'just-some-object'[39m }
         Error: :::0:err::: /console: test
             at e (turbopack:///[project]/app/console/page.tsx:<line>:<col>)
         [0m [90m 40 |[39m   })
          [90m 41 |[39m   [36mawait[39m [35m1[39m
         [31m[1m>[22m[39m[90m 42 |[39m   console[33m.[39merror([36mnew[39m [33mError[39m([32m\`\${errBadge} /console: test\`[39m))
          [90m    |[39m                 [31m[1m^[22m[39m
          [90m 43 |[39m   [36mawait[39m [35m1[39m
          [90m 44 |[39m   console[33m.[39massert(
          [90m 45 |[39m     [36mfalse[39m[33m,[39m[0m
         Assertion failed: :::0:err::: /console: This is an assert message with a template
         :::0:err::: /console: not a template { foo: [32m'just-some-object'[39m }
         Assertion failed: :::0:err::: /console: This is an assert message with a template
         :::1:out::: /console: template(one: one, two: two)
         :::1:out::: /console: This is a console page. Don't match the codeframe.
         :::1:out::: /console: template(one: one, two: two)
         :::1:out::: /console: This is a console page. Don't match the codeframe.
         :::1:err::: /console: not a template { foo: [32m'just-some-object'[39m }
         Error: :::1:err::: /console: test
             at e (turbopack:///[project]/app/console/page.tsx:<line>:<col>)
         [0m [90m 40 |[39m   })
          [90m 41 |[39m   [36mawait[39m [35m1[39m
         [31m[1m>[22m[39m[90m 42 |[39m   console[33m.[39merror([36mnew[39m [33mError[39m([32m\`\${errBadge} /console: test\`[39m))
          [90m    |[39m                 [31m[1m^[22m[39m
          [90m 43 |[39m   [36mawait[39m [35m1[39m
          [90m 44 |[39m   console[33m.[39massert(
          [90m 45 |[39m     [36mfalse[39m[33m,[39m[0m
         Assertion failed: :::1:err::: /console: This is an assert message with a template
         :::1:err::: /console: not a template { foo: [32m'just-some-object'[39m }
         Assertion failed: :::1:err::: /console: This is an assert message with a template"
        `)
      } else {
        expect(reorderedLines).toMatchInlineSnapshot(`
         ":::0:out::: /console: template(one: one, two: two)
         :::0:out::: /console: This is a console page. Don't match the codeframe.
         :::0:out::: /console: template(one: one, two: two)
         :::0:out::: /console: This is a console page. Don't match the codeframe.
         :::0:err::: /console: not a template { foo: [32m'just-some-object'[39m }
         Error: :::0:err::: /console: test
             at g (.next/server/app/console/page.js:<line>:<col>)
         Assertion failed: :::0:err::: /console: This is an assert message with a template
         :::0:err::: /console: not a template { foo: [32m'just-some-object'[39m }
         Assertion failed: :::0:err::: /console: This is an assert message with a template
         :::1:out::: /console: template(one: one, two: two)
         :::1:out::: /console: This is a console page. Don't match the codeframe.
         :::1:out::: /console: template(one: one, two: two)
         :::1:out::: /console: This is a console page. Don't match the codeframe.
         :::1:err::: /console: not a template { foo: [32m'just-some-object'[39m }
         Error: :::1:err::: /console: test
             at g (.next/server/app/console/page.js:<line>:<col>)
         Assertion failed: :::1:err::: /console: This is an assert message with a template
         :::1:err::: /console: not a template { foo: [32m'just-some-object'[39m }
         Assertion failed: :::1:err::: /console: This is an assert message with a template"
        `)
      }
    }
  })
})

// TODO(restart-on-cache-miss): cacheSignal timing changes break console log dimming/hiding tests
describe.skip('cache-components - Logging after Abort', () => {
  describe('(default) With Dimming - Server', () => {
    const { next, skipped, isTurbopack } = nextTestSetup({
      env: {
        FORCE_COLOR: '1',
      },
      files: __dirname + '/fixtures/default',
      skipDeployment: true,
      skipStart: !isNextDev,
    })

    if (skipped) {
      return
    }

    it('dims console calls after a prerender has aborted', async () => {
      const path: string = '/console-after-abort/server'

      if (isNextDev) {
        const browser = await next.browser(path, {})

        await retry(() => {
          expect(stripAnsi(next.cliOutput)).toContain(`GET ${path} 200`)
        })

        // do not strip ANSI codes here since we're explicitly testing coloring.
        const cliOutputFromPage = next.cliOutput.match(
          new RegExp(`Compiled ${path}[^\n]+\n(.*)`, 's')
        )[1]

        const reorderedLines = reorderLinesByBadge(cliOutputFromPage)

        expect(reorderedLines).toMatchInlineSnapshot(`
         ":::0:out::: /console-after-abort/server: logging before trying await headers()
         :::0:out::: /console-after-abort/server: template(one: one, two: two)
         :::0:out::: /console-after-abort/server: This is a console page. Don't match the codeframe.
         :::0:out::: /console-after-abort/server: template(one: one, two: two)
         :::0:out::: /console-after-abort/server: This is a console page. Don't match the codeframe.
         [0m[7m Cache [0m :::0:out::: /console-after-abort/server: template(one: one, two: two)
         [0m[7m Cache [0m :::0:out::: /console-after-abort/server: This is a console page. Don't match the codeframe.
         :::0:err::: /console-after-abort/server: not a template { foo: [32m'just-some-object'[39m }
         Error: :::0:err::: /console-after-abort/server: test
             at ConsolePage (app/console-after-abort/server/page.tsx:<line>:<col>)
         [0m [90m 57 |[39m     foo[33m:[39m [32m'just-some-object'[39m[33m,[39m
          [90m 58 |[39m   })
         [31m[1m>[22m[39m[90m 59 |[39m   console[33m.[39merror([36mnew[39m [33mError[39m([32m\`\${errBadge} /console-after-abort/server: test\`[39m))
          [90m    |[39m                 [31m[1m^[22m[39m
          [90m 60 |[39m   console[33m.[39massert(
          [90m 61 |[39m     [36mfalse[39m[33m,[39m
          [90m 62 |[39m     [32m\`\${errBadge} /console-after-abort/server: This is an assert message with a %s\`[39m[33m,[39m[0m
         Assertion failed: :::0:err::: /console-after-abort/server: This is an assert message with a template
         :::0:err::: /console-after-abort/server: not a template { foo: [32m'just-some-object'[39m }
         Assertion failed: :::0:err::: /console-after-abort/server: This is an assert message with a template
         [0m[7m Cache [0m :::0:err::: /console-after-abort/server: not a template { foo: [32m'just-some-object'[39m }
         Assertion failed: [0m[7m Cache [0m :::0:err::: /console-after-abort/server: This is an assert message with a template
         [0m[7m Cache [0m Assertion failed: :::0:err::: /console-after-abort/server: This is an assert message with a template
         [2m:::1:out::: /console-after-abort/server: logging before trying await headers()[22m[2m[22m
         [2m:::1:out::: /console-after-abort/server: template(one: one, two: two)[22m[2m[22m
         [2m:::1:out::: /console-after-abort/server: This is a console page. Don't match the codeframe.[22m[2m[22m
         [2m:::1:err::: /console-after-abort/server: caught error trying await headers()[22m[2m[22m
         [2m:::1:err::: /console-after-abort/server: not a template { foo: [32m'just-some-object'[39m }[22m[2m[22m
         [2mError: :::1:err::: /console-after-abort/server: test
             at ConsolePage (app/console-after-abort/server/page.tsx:<line>:<col>)
         [0m [90m 57 |[39m     foo[33m:[39m [32m'just-some-object'[39m[33m,[39m
          [90m 58 |[39m   })
         [31m[1m>[22m[39m[90m 59 |[39m   console[33m.[39merror([36mnew[39m [33mError[39m([32m\`\${errBadge} /console-after-abort/server: test\`[39m))
          [90m    |[39m                 [31m[1m^[22m[39m
          [90m 60 |[39m   console[33m.[39massert(
          [90m 61 |[39m     [36mfalse[39m[33m,[39m
          [90m 62 |[39m     [32m\`\${errBadge} /console-after-abort/server: This is an assert message with a %s\`[39m[33m,[39m[0m[22m[2m[22m
         [2mAssertion failed: [2m:::1:err::: /console-after-abort/server: This is an assert message with a template[22m[2m[2m[22m[2m[22m[2m[22m
         [2m:::2:out::: /console-after-abort/server: logging before trying await headers()[22m[2m[22m
         [2m:::2:out::: /console-after-abort/server: template(one: one, two: two)[22m[2m[22m
         [2m:::2:out::: /console-after-abort/server: This is a console page. Don't match the codeframe.[22m[2m[22m
         [2m:::2:err::: /console-after-abort/server: caught error trying await headers()[22m[2m[22m
         [2m:::2:err::: /console-after-abort/server: not a template { foo: [32m'just-some-object'[39m }[22m[2m[22m
         [2mError: :::2:err::: /console-after-abort/server: test
             at ConsolePage (app/console-after-abort/server/page.tsx:<line>:<col>)
         [0m [90m 57 |[39m     foo[33m:[39m [32m'just-some-object'[39m[33m,[39m
          [90m 58 |[39m   })
         [31m[1m>[22m[39m[90m 59 |[39m   console[33m.[39merror([36mnew[39m [33mError[39m([32m\`\${errBadge} /console-after-abort/server: test\`[39m))
          [90m    |[39m                 [31m[1m^[22m[39m
          [90m 60 |[39m   console[33m.[39massert(
          [90m 61 |[39m     [36mfalse[39m[33m,[39m
          [90m 62 |[39m     [32m\`\${errBadge} /console-after-abort/server: This is an assert message with a %s\`[39m[33m,[39m[0m[22m[2m[22m
         [2mAssertion failed: [2m:::2:err::: /console-after-abort/server: This is an assert message with a template[22m[2m[2m[22m[2m[22m[2m[22m
         "
        `)

        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "description": ":::0:err::: /console-after-abort/server: test",
           "environmentLabel": "Server",
           "label": "Console Error",
           "source": "app/console-after-abort/server/page.tsx (59:17) @ ConsolePage
         > 59 |   console.error(new Error(\`\${errBadge} /console-after-abort/server: test\`))
              |                 ^",
           "stack": [
             "ConsolePage app/console-after-abort/server/page.tsx (59:17)",
             "ConsolePage <anonymous>",
           ],
         }
        `)
      } else {
        try {
          await next.build({
            env: {
              NEXT_PRIVATE_APP_PATHS: `["${path === '/' ? '' : path}/page.tsx"]`,
            },
          })
        } catch (err) {
          const error = new Error(
            'Expected build to complete successfully, but it failed'
          )
          error.cause = err
          throw error
        }

        const unorderedLines = next.cliOutput.match(
          /Collecting page data[^\n]+\n(.*)\n.*Finalizing page optimization /s
        )[1]

        const reorderedLines = reorderLinesByBadge(unorderedLines)

        if (isTurbopack) {
          expect(reorderedLines).toMatchInlineSnapshot(`
           ":::0:out::: /console-after-abort/server: logging before trying await headers()
           [2m:::0:out::: /console-after-abort/server: template(one: one, two: two)[22m[2m[22m
           [2m:::0:out::: /console-after-abort/server: This is a console page. Don't match the codeframe.[22m[2m[22m
           [2m:::0:err::: /console-after-abort/server: caught error trying await headers()[22m[2m[22m
           [2m:::0:err::: /console-after-abort/server: not a template { foo: [32m'just-some-object'[39m }[22m[2m[22m
           [2mError: :::0:err::: /console-after-abort/server: test
               at g (turbopack:///[project]/app/console-after-abort/server/page.tsx:<line>:<col>)
           [0m [90m 57 |[39m     foo[33m:[39m [32m'just-some-object'[39m[33m,[39m
            [90m 58 |[39m   })
           [31m[1m>[22m[39m[90m 59 |[39m   console[33m.[39merror([36mnew[39m [33mError[39m([32m\`\${errBadge} /console-after-abort/server: test\`[39m))
            [90m    |[39m                 [31m[1m^[22m[39m
            [90m 60 |[39m   console[33m.[39massert(
            [90m 61 |[39m     [36mfalse[39m[33m,[39m
            [90m 62 |[39m     [32m\`\${errBadge} /console-after-abort/server: This is an assert message with a %s\`[39m[33m,[39m[0m[22m[2m[22m
           [2mAssertion failed: [2m:::0:err::: /console-after-abort/server: This is an assert message with a template[22m[2m[2m[22m[2m[22m[2m[22m
           :::1:out::: /console-after-abort/server: logging before trying await headers()
           [2m:::1:out::: /console-after-abort/server: template(one: one, two: two)[22m[2m[22m
           [2m:::1:out::: /console-after-abort/server: This is a console page. Don't match the codeframe.[22m[2m[22m
           [2m:::1:err::: /console-after-abort/server: caught error trying await headers()[22m[2m[22m
           [2m:::1:err::: /console-after-abort/server: not a template { foo: [32m'just-some-object'[39m }[22m[2m[22m
           [2mError: :::1:err::: /console-after-abort/server: test
               at g (turbopack:///[project]/app/console-after-abort/server/page.tsx:<line>:<col>)
           [0m [90m 57 |[39m     foo[33m:[39m [32m'just-some-object'[39m[33m,[39m
            [90m 58 |[39m   })
           [31m[1m>[22m[39m[90m 59 |[39m   console[33m.[39merror([36mnew[39m [33mError[39m([32m\`\${errBadge} /console-after-abort/server: test\`[39m))
            [90m    |[39m                 [31m[1m^[22m[39m
            [90m 60 |[39m   console[33m.[39massert(
            [90m 61 |[39m     [36mfalse[39m[33m,[39m
            [90m 62 |[39m     [32m\`\${errBadge} /console-after-abort/server: This is an assert message with a %s\`[39m[33m,[39m[0m[22m[2m[22m
           [2mAssertion failed: [2m:::1:err::: /console-after-abort/server: This is an assert message with a template[22m[2m[2m[22m[2m[22m[2m[22m"
          `)
        } else {
          expect(reorderedLines).toMatchInlineSnapshot(`
           ":::0:out::: /console-after-abort/server: logging before trying await headers()
           [2m:::0:out::: /console-after-abort/server: template(one: one, two: two)[22m[2m[22m
           [2m:::0:out::: /console-after-abort/server: This is a console page. Don't match the codeframe.[22m[2m[22m
           [2m:::0:err::: /console-after-abort/server: caught error trying await headers()[22m[2m[22m
           [2m:::0:err::: /console-after-abort/server: not a template { foo: [32m'just-some-object'[39m }[22m[2m[22m
           [2mError: :::0:err::: /console-after-abort/server: test
               at i (.next/server/app/console-after-abort/server/page.js:<line>:<col>)[22m[2m[22m
           [2mAssertion failed: [2m:::0:err::: /console-after-abort/server: This is an assert message with a template[22m[2m[2m[22m[2m[22m[2m[22m
           :::1:out::: /console-after-abort/server: logging before trying await headers()
           [2m:::1:out::: /console-after-abort/server: template(one: one, two: two)[22m[2m[22m
           [2m:::1:out::: /console-after-abort/server: This is a console page. Don't match the codeframe.[22m[2m[22m
           [2m:::1:err::: /console-after-abort/server: caught error trying await headers()[22m[2m[22m
           [2m:::1:err::: /console-after-abort/server: not a template { foo: [32m'just-some-object'[39m }[22m[2m[22m
           [2mError: :::1:err::: /console-after-abort/server: test
               at i (.next/server/app/console-after-abort/server/page.js:<line>:<col>)[22m[2m[22m
           [2mAssertion failed: [2m:::1:err::: /console-after-abort/server: This is an assert message with a template[22m[2m[2m[22m[2m[22m[2m[22m"
          `)
        }
      }
    })
  })

  describe('(default) With Dimming - Client', () => {
    const { next, skipped, isTurbopack } = nextTestSetup({
      env: {
        FORCE_COLOR: '1',
      },
      files: __dirname + '/fixtures/default',
      skipDeployment: true,
      skipStart: !isNextDev,
    })

    if (skipped) {
      return
    }

    it('dims console calls after a prerender has aborted', async () => {
      const path: string = '/console-after-abort/client'

      if (isNextDev) {
        const browser = await next.browser(path, {})

        await retry(() => {
          expect(stripAnsi(next.cliOutput)).toContain(`GET ${path} 200`)
        })

        // do not strip ANSI codes here since we're explicitly testing coloring.
        const cliOutputFromPage = next.cliOutput.match(
          new RegExp(`Compiled ${path}[^\n]+\n(.*)`, 's')
        )[1]

        const reorderedLines = reorderLinesByBadge(cliOutputFromPage)

        expect(reorderedLines).toMatchInlineSnapshot(`
         ":::0:out::: /console-after-abort/client: logging before prerender abort
         :::0:out::: /console-after-abort/client: logging before prerender aborts in client component
         :::0:out::: /console-after-abort/client: template(one: one, two: two)
         :::0:out::: /console-after-abort/client: This is a console page. Don't match the codeframe.
         :::0:err::: /console-after-abort/client: not a template { foo: [32m'just-some-object'[39m }
         Error: :::0:err::: /console-after-abort/client: test
             at log (app/console-after-abort/client/client.tsx:<line>:<col>)
         [0m [90m 15 |[39m     foo[33m:[39m [32m'just-some-object'[39m[33m,[39m
          [90m 16 |[39m   })
         [31m[1m>[22m[39m[90m 17 |[39m   console[33m.[39merror([36mnew[39m [33mError[39m([32m\`\${errBadge} /console-after-abort/client: test\`[39m))
          [90m    |[39m                 [31m[1m^[22m[39m
          [90m 18 |[39m   console[33m.[39massert(
          [90m 19 |[39m     [36mfalse[39m[33m,[39m
          [90m 20 |[39m     [32m\`\${errBadge} /console-after-abort/client: This is an assert message with a %s\`[39m[33m,[39m[0m
         Assertion failed: :::0:err::: /console-after-abort/client: This is an assert message with a template
         [2m:::1:out::: /console-after-abort/client: logging before prerender abort[22m[2m[22m
         [2m:::1:out::: /console-after-abort/client: logging before prerender aborts in client component[22m[2m[22m
         [2m:::1:out::: /console-after-abort/client: template(one: one, two: two)[22m[2m[22m
         [2m:::1:out::: /console-after-abort/client: This is a console page. Don't match the codeframe.[22m[2m[22m
         [2m:::1:err::: /console-after-abort/client: not a template { foo: [32m'just-some-object'[39m }[22m[2m[22m
         [2mError: :::1:err::: /console-after-abort/client: test
             at log (app/console-after-abort/client/client.tsx:<line>:<col>)
         [0m [90m 15 |[39m     foo[33m:[39m [32m'just-some-object'[39m[33m,[39m
          [90m 16 |[39m   })
         [31m[1m>[22m[39m[90m 17 |[39m   console[33m.[39merror([36mnew[39m [33mError[39m([32m\`\${errBadge} /console-after-abort/client: test\`[39m))
          [90m    |[39m                 [31m[1m^[22m[39m
          [90m 18 |[39m   console[33m.[39massert(
          [90m 19 |[39m     [36mfalse[39m[33m,[39m
          [90m 20 |[39m     [32m\`\${errBadge} /console-after-abort/client: This is an assert message with a %s\`[39m[33m,[39m[0m[22m[2m[22m
         [2mAssertion failed: [2m:::1:err::: /console-after-abort/client: This is an assert message with a template[22m[2m[2m[22m[2m[22m[2m[22m
         [2m:::2:out::: /console-after-abort/client: logging before prerender abort[22m[2m[22m
         [2m:::2:out::: /console-after-abort/client: logging before prerender aborts in client component[22m[2m[22m
         [2m:::2:out::: /console-after-abort/client: template(one: one, two: two)[22m[2m[22m
         [2m:::2:out::: /console-after-abort/client: This is a console page. Don't match the codeframe.[22m[2m[22m
         [2m:::2:err::: /console-after-abort/client: not a template { foo: [32m'just-some-object'[39m }[22m[2m[22m
         [2mError: :::2:err::: /console-after-abort/client: test
             at log (app/console-after-abort/client/client.tsx:<line>:<col>)
         [0m [90m 15 |[39m     foo[33m:[39m [32m'just-some-object'[39m[33m,[39m
          [90m 16 |[39m   })
         [31m[1m>[22m[39m[90m 17 |[39m   console[33m.[39merror([36mnew[39m [33mError[39m([32m\`\${errBadge} /console-after-abort/client: test\`[39m))
          [90m    |[39m                 [31m[1m^[22m[39m
          [90m 18 |[39m   console[33m.[39massert(
          [90m 19 |[39m     [36mfalse[39m[33m,[39m
          [90m 20 |[39m     [32m\`\${errBadge} /console-after-abort/client: This is an assert message with a %s\`[39m[33m,[39m[0m[22m[2m[22m
         [2mAssertion failed: [2m:::2:err::: /console-after-abort/client: This is an assert message with a template[22m[2m[2m[22m[2m[22m[2m[22m
         "
        `)

        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "description": ":::0:err::: /console-after-abort/client: test",
           "environmentLabel": null,
           "label": "Console Error",
           "source": "app/console-after-abort/client/client.tsx (17:17) @ log
         > 17 |   console.error(new Error(\`\${errBadge} /console-after-abort/client: test\`))
              |                 ^",
           "stack": [
             "log app/console-after-abort/client/client.tsx (17:17)",
           ],
         }
        `)
      } else {
        try {
          await next.build({
            env: {
              NEXT_PRIVATE_APP_PATHS: `["${path === '/' ? '' : path}/page.tsx"]`,
            },
          })
        } catch (err) {
          const error = new Error(
            'Expected build to complete successfully, but it failed'
          )
          error.cause = err
          throw error
        }

        const unorderedLines = next.cliOutput.match(
          /Collecting page data[^\n]+\n(.*)\n.*Finalizing page optimization /s
        )[1]

        const reorderedLines = reorderLinesByBadge(unorderedLines)

        if (isTurbopack) {
          expect(reorderedLines).toMatchInlineSnapshot(`
           ":::0:out::: /console-after-abort/client: logging before prerender abort
           :::0:out::: /console-after-abort/client: logging before prerender aborts in client component
           [2m:::0:out::: /console-after-abort/client: template(one: one, two: two)[22m[2m[22m
           [2m:::0:out::: /console-after-abort/client: This is a console page. Don't match the codeframe.[22m[2m[22m
           [2m:::0:err::: /console-after-abort/client: not a template { foo: [32m'just-some-object'[39m }[22m[2m[22m
           [2mError: :::0:err::: /console-after-abort/client: test
               at c (turbopack:///[project]/app/console-after-abort/client/client.tsx:<line>:<col>)
           [0m [90m 15 |[39m     foo[33m:[39m [32m'just-some-object'[39m[33m,[39m
            [90m 16 |[39m   })
           [31m[1m>[22m[39m[90m 17 |[39m   console[33m.[39merror([36mnew[39m [33mError[39m([32m\`\${errBadge} /console-after-abort/client: test\`[39m))
            [90m    |[39m                 [31m[1m^[22m[39m
            [90m 18 |[39m   console[33m.[39massert(
            [90m 19 |[39m     [36mfalse[39m[33m,[39m
            [90m 20 |[39m     [32m\`\${errBadge} /console-after-abort/client: This is an assert message with a %s\`[39m[33m,[39m[0m[22m[2m[22m
           [2mAssertion failed: [2m:::0:err::: /console-after-abort/client: This is an assert message with a template[22m[2m[2m[22m[2m[22m[2m[22m
           :::1:out::: /console-after-abort/client: logging before prerender abort
           :::1:out::: /console-after-abort/client: logging before prerender aborts in client component
           [2m:::1:out::: /console-after-abort/client: template(one: one, two: two)[22m[2m[22m
           [2m:::1:out::: /console-after-abort/client: This is a console page. Don't match the codeframe.[22m[2m[22m
           [2m:::1:err::: /console-after-abort/client: not a template { foo: [32m'just-some-object'[39m }[22m[2m[22m
           [2mError: :::1:err::: /console-after-abort/client: test
               at c (turbopack:///[project]/app/console-after-abort/client/client.tsx:<line>:<col>)
           [0m [90m 15 |[39m     foo[33m:[39m [32m'just-some-object'[39m[33m,[39m
            [90m 16 |[39m   })
           [31m[1m>[22m[39m[90m 17 |[39m   console[33m.[39merror([36mnew[39m [33mError[39m([32m\`\${errBadge} /console-after-abort/client: test\`[39m))
            [90m    |[39m                 [31m[1m^[22m[39m
            [90m 18 |[39m   console[33m.[39massert(
            [90m 19 |[39m     [36mfalse[39m[33m,[39m
            [90m 20 |[39m     [32m\`\${errBadge} /console-after-abort/client: This is an assert message with a %s\`[39m[33m,[39m[0m[22m[2m[22m
           [2mAssertion failed: [2m:::1:err::: /console-after-abort/client: This is an assert message with a template[22m[2m[2m[22m[2m[22m[2m[22m"
          `)
        } else {
          expect(reorderedLines).toMatchInlineSnapshot(`
           ":::0:out::: /console-after-abort/client: logging before prerender abort
           :::0:out::: /console-after-abort/client: logging before prerender aborts in client component
           [2m:::0:out::: /console-after-abort/client: template(one: one, two: two)[22m[2m[22m
           [2m:::0:out::: /console-after-abort/client: This is a console page. Don't match the codeframe.[22m[2m[22m
           [2m:::0:err::: /console-after-abort/client: not a template { foo: [32m'just-some-object'[39m }[22m[2m[22m
           [2mError: :::0:err::: /console-after-abort/client: test
               at e (.next/server/app/console-after-abort/client/page.js:<line>:<col>)[22m[2m[22m
           [2mAssertion failed: [2m:::0:err::: /console-after-abort/client: This is an assert message with a template[22m[2m[2m[22m[2m[22m[2m[22m
           :::1:out::: /console-after-abort/client: logging before prerender abort
           :::1:out::: /console-after-abort/client: logging before prerender aborts in client component
           [2m:::1:out::: /console-after-abort/client: template(one: one, two: two)[22m[2m[22m
           [2m:::1:out::: /console-after-abort/client: This is a console page. Don't match the codeframe.[22m[2m[22m
           [2m:::1:err::: /console-after-abort/client: not a template { foo: [32m'just-some-object'[39m }[22m[2m[22m
           [2mError: :::1:err::: /console-after-abort/client: test
               at e (.next/server/app/console-after-abort/client/page.js:<line>:<col>)[22m[2m[22m
           [2mAssertion failed: [2m:::1:err::: /console-after-abort/client: This is an assert message with a template[22m[2m[2m[22m[2m[22m[2m[22m"
          `)
        }
      }
    })
  })

  describe('With Hiding - Server', () => {
    const { next, skipped } = nextTestSetup({
      env: {
        FORCE_COLOR: '1',
      },
      files: __dirname + '/fixtures/hide-logs-after-abort',
      skipDeployment: true,
      skipStart: !isNextDev,
    })

    if (skipped) {
      return
    }

    it('hides console calls after a prerender has aborted', async () => {
      const path: string = '/console-after-abort/server'

      if (isNextDev) {
        const browser = await next.browser(path, {})

        await retry(() => {
          expect(stripAnsi(next.cliOutput)).toContain(`GET ${path} 200`)
        })

        // do not strip ANSI codes here since we're explicitly testing coloring.
        const cliOutputFromPage = next.cliOutput.match(
          new RegExp(`Compiled ${path}[^\n]+\n(.*)`, 's')
        )[1]

        const reorderedLines = reorderLinesByBadge(cliOutputFromPage)

        expect(reorderedLines).toMatchInlineSnapshot(`
         ":::0:out::: /console-after-abort/server: logging before trying await headers()
         :::0:out::: /console-after-abort/server: template(one: one, two: two)
         :::0:out::: /console-after-abort/server: This is a console page. Don't match the codeframe.
         :::0:out::: /console-after-abort/server: template(one: one, two: two)
         :::0:out::: /console-after-abort/server: This is a console page. Don't match the codeframe.
         [0m[7m Cache [0m :::0:out::: /console-after-abort/server: template(one: one, two: two)
         [0m[7m Cache [0m :::0:out::: /console-after-abort/server: This is a console page. Don't match the codeframe.
         :::0:err::: /console-after-abort/server: not a template { foo: [32m'just-some-object'[39m }
         Error: :::0:err::: /console-after-abort/server: test
             at ConsolePage (app/console-after-abort/server/page.tsx:<line>:<col>)
         [0m [90m 57 |[39m     foo[33m:[39m [32m'just-some-object'[39m[33m,[39m
          [90m 58 |[39m   })
         [31m[1m>[22m[39m[90m 59 |[39m   console[33m.[39merror([36mnew[39m [33mError[39m([32m\`\${errBadge} /console-after-abort/server: test\`[39m))
          [90m    |[39m                 [31m[1m^[22m[39m
          [90m 60 |[39m   console[33m.[39massert(
          [90m 61 |[39m     [36mfalse[39m[33m,[39m
          [90m 62 |[39m     [32m\`\${errBadge} /console-after-abort/server: This is an assert message with a %s\`[39m[33m,[39m[0m
         Assertion failed: :::0:err::: /console-after-abort/server: This is an assert message with a template
         :::0:err::: /console-after-abort/server: not a template { foo: [32m'just-some-object'[39m }
         Assertion failed: :::0:err::: /console-after-abort/server: This is an assert message with a template
         [0m[7m Cache [0m :::0:err::: /console-after-abort/server: not a template { foo: [32m'just-some-object'[39m }
         Assertion failed: [0m[7m Cache [0m :::0:err::: /console-after-abort/server: This is an assert message with a template
         [0m[7m Cache [0m Assertion failed: :::0:err::: /console-after-abort/server: This is an assert message with a template
         [2m:::1:out::: /console-after-abort/server: logging before trying await headers()[22m[2m[22m
         [2m:::2:out::: /console-after-abort/server: logging before trying await headers()[22m[2m[22m
         "
        `)

        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "description": ":::0:err::: /console-after-abort/server: test",
           "environmentLabel": "Server",
           "label": "Console Error",
           "source": "app/console-after-abort/server/page.tsx (59:17) @ ConsolePage
         > 59 |   console.error(new Error(\`\${errBadge} /console-after-abort/server: test\`))
              |                 ^",
           "stack": [
             "ConsolePage app/console-after-abort/server/page.tsx (59:17)",
             "ConsolePage <anonymous>",
           ],
         }
        `)
      } else {
        try {
          await next.build({
            env: {
              NEXT_PRIVATE_APP_PATHS: `["${path === '/' ? '' : path}/page.tsx"]`,
            },
          })
        } catch (err) {
          const error = new Error(
            'Expected build to complete successfully, but it failed'
          )
          error.cause = err
          throw error
        }

        const unorderedLines = next.cliOutput.match(
          /Collecting page data[^\n]+\n(.*)\n.*Finalizing page optimization /s
        )[1]

        const reorderedLines = reorderLinesByBadge(unorderedLines)

        expect(reorderedLines).toMatchInlineSnapshot(`
           ":::0:out::: /console-after-abort/server: logging before trying await headers()
           :::1:out::: /console-after-abort/server: logging before trying await headers()"
          `)
      }
    })
  })

  describe('With Hiding - Client', () => {
    const { next, skipped } = nextTestSetup({
      env: {
        FORCE_COLOR: '1',
      },
      files: __dirname + '/fixtures/hide-logs-after-abort',
      skipDeployment: true,
      skipStart: !isNextDev,
    })

    if (skipped) {
      return
    }

    it('hides console calls after a prerender has aborted', async () => {
      const path: string = '/console-after-abort/client'

      if (isNextDev) {
        const browser = await next.browser(path, {})

        await retry(() => {
          expect(stripAnsi(next.cliOutput)).toContain(`GET ${path} 200`)
        })

        // do not strip ANSI codes here since we're explicitly testing coloring.
        const cliOutputFromPage = next.cliOutput.match(
          new RegExp(`Compiled ${path}[^\n]+\n(.*)`, 's')
        )[1]

        const reorderedLines = reorderLinesByBadge(cliOutputFromPage)

        expect(reorderedLines).toMatchInlineSnapshot(`
         ":::0:out::: /console-after-abort/client: logging before prerender abort
         :::0:out::: /console-after-abort/client: logging before prerender aborts in client component
         :::0:out::: /console-after-abort/client: template(one: one, two: two)
         :::0:out::: /console-after-abort/client: This is a console page. Don't match the codeframe.
         :::0:err::: /console-after-abort/client: not a template { foo: [32m'just-some-object'[39m }
         Error: :::0:err::: /console-after-abort/client: test
             at log (app/console-after-abort/client/client.tsx:<line>:<col>)
         [0m [90m 15 |[39m     foo[33m:[39m [32m'just-some-object'[39m[33m,[39m
          [90m 16 |[39m   })
         [31m[1m>[22m[39m[90m 17 |[39m   console[33m.[39merror([36mnew[39m [33mError[39m([32m\`\${errBadge} /console-after-abort/client: test\`[39m))
          [90m    |[39m                 [31m[1m^[22m[39m
          [90m 18 |[39m   console[33m.[39massert(
          [90m 19 |[39m     [36mfalse[39m[33m,[39m
          [90m 20 |[39m     [32m\`\${errBadge} /console-after-abort/client: This is an assert message with a %s\`[39m[33m,[39m[0m
         Assertion failed: :::0:err::: /console-after-abort/client: This is an assert message with a template
         [2m:::1:out::: /console-after-abort/client: logging before prerender abort[22m[2m[22m
         [2m:::1:out::: /console-after-abort/client: logging before prerender aborts in client component[22m[2m[22m
         [2m:::2:out::: /console-after-abort/client: logging before prerender abort[22m[2m[22m
         [2m:::2:out::: /console-after-abort/client: logging before prerender aborts in client component[22m[2m[22m
         "
        `)

        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "description": ":::0:err::: /console-after-abort/client: test",
           "environmentLabel": null,
           "label": "Console Error",
           "source": "app/console-after-abort/client/client.tsx (17:17) @ log
         > 17 |   console.error(new Error(\`\${errBadge} /console-after-abort/client: test\`))
              |                 ^",
           "stack": [
             "log app/console-after-abort/client/client.tsx (17:17)",
           ],
         }
        `)
      } else {
        try {
          await next.build({
            env: {
              NEXT_PRIVATE_APP_PATHS: `["${path === '/' ? '' : path}/page.tsx"]`,
            },
          })
        } catch (err) {
          const error = new Error(
            'Expected build to complete successfully, but it failed'
          )
          error.cause = err
          throw error
        }

        const unorderedLines = next.cliOutput.match(
          /Collecting page data[^\n]+\n(.*)\n.*Finalizing page optimization /s
        )[1]

        const reorderedLines = reorderLinesByBadge(unorderedLines)

        expect(reorderedLines).toMatchInlineSnapshot(`
           ":::0:out::: /console-after-abort/client: logging before prerender abort
           :::0:out::: /console-after-abort/client: logging before prerender aborts in client component
           :::1:out::: /console-after-abort/client: logging before prerender abort
           :::1:out::: /console-after-abort/client: logging before prerender aborts in client component"
          `)
      }
    })
  })
})

type RenderGroups = Map<string | null, StreamGroups>
type StreamGroups = Map<string | null, Lines>
type Lines = Array<string>

function reorderLinesByBadge(selectedOutput: string) {
  const unorderedLines = selectedOutput
    .split('\n')
    .filter(
      (l) => !(l.includes('Generating static pages') || l.includes(' GET '))
    )
    .map((l) => l.replace(/( at .*):\d+:\d+/, '$1:<line>:<col>'))

  let currentLines: Lines = []
  const renderGroups: RenderGroups = new Map([
    [null, new Map([[null, currentLines]]) satisfies StreamGroups],
  ])

  for (let line of unorderedLines) {
    let match = line.match(/:::([^: \n]+):([^: \n]+):::/)
    if (match) {
      const [_, render, stream] = match
      const streamGroups = renderGroups.get(render)
      if (!streamGroups) {
        currentLines = []
        renderGroups.set(render, new Map([[stream, currentLines]]))
      } else {
        currentLines = streamGroups.get(stream)
        if (!currentLines) {
          streamGroups.set(stream, (currentLines = []))
        }
      }
    }
    currentLines.push(line)
  }

  const orderedRenders = Array.from(renderGroups.values())
  const orderedStreams = orderedRenders.map((s) =>
    Array.from(s.values()).flat()
  )

  return orderedStreams.flat().join('\n')
}
