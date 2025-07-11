import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import stripAnsi from 'strip-ansi'

describe('dynamic-io', () => {
  const { isNextDev, isTurbopack, next, skipped } = nextTestSetup({
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
       /console: not a template { foo: 'just-some-object' }
       Error: /console: test
           at ConsolePage (app/console/page.tsx:5:16)
         3 |   console.log('/console: This is a console page')
         4 |   console.warn('/console: not a template', { foo: 'just-some-object' })
       > 5 |   console.error(new Error('/console: test'))
           |                ^
         6 |   console.assert(
         7 |     false,
         8 |     '/console: This is an assert message with a %s',
       Assertion failed: /console: This is an assert message with a template
       /console: template(one: one, two: two)
       /console: This is a console page
       /console: not a template { foo: 'just-some-object' }
       Error: /console: test
           at ConsolePage (app/console/page.tsx:5:16)
         3 |   console.log('/console: This is a console page')
         4 |   console.warn('/console: not a template', { foo: 'just-some-object' })
       > 5 |   console.error(new Error('/console: test'))
           |                ^
         6 |   console.assert(
         7 |     false,
         8 |     '/console: This is an assert message with a %s',
       Assertion failed: /console: This is an assert message with a template
       /console: template(one: one, two: two)
       /console: This is a console page
       /console: not a template { foo: 'just-some-object' }
       Error: /console: test
           at ConsolePage (app/console/page.tsx:5:16)
         3 |   console.log('/console: This is a console page')
         4 |   console.warn('/console: not a template', { foo: 'just-some-object' })
       > 5 |   console.error(new Error('/console: test'))
           |                ^
         6 |   console.assert(
         7 |     false,
         8 |     '/console: This is an assert message with a %s',
       Assertion failed: /console: This is an assert message with a template"
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
