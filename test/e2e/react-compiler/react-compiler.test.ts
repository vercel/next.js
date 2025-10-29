import { nextTestSetup, FileRef } from 'e2e-utils'
import { assertHasRedbox } from 'next-test-utils'
import { join } from 'path'
import stripAnsi from 'strip-ansi'

function normalizeCodeLocInfo(str) {
  return (
    str &&
    str.replace(/^ +(?:at|in) ([\S]+)[^\n]*/gm, function (m, name) {
      const dot = name.lastIndexOf('.')
      if (dot !== -1) {
        name = name.slice(dot + 1)
      }
      return '    at ' + name + (/\d/.test(m) ? ' (**)' : '')
    })
  )
}

describe.each(['default', 'babelrc'] as const)(
  'react-compiler %s',
  (variant) => {
    const dependencies = (global as any).isNextDeploy
      ? // `link` is incompatible with the npm version used when this test is deployed
        {
          'reference-library': 'file:./reference-library',
        }
      : {
          'reference-library': 'link:./reference-library',
        }
    const { next, isNextDev, isTurbopack } = nextTestSetup({
      files:
        variant === 'babelrc'
          ? __dirname
          : {
              app: new FileRef(join(__dirname, 'app')),
              'next.config.js': new FileRef(join(__dirname, 'next.config.js')),
              'reference-library': new FileRef(
                join(__dirname, 'reference-library')
              ),
            },
      // TODO: set only config instead once bundlers are consistent
      buildArgs: ['--profile'],
      dependencies: {
        'babel-plugin-react-compiler': '0.0.0-experimental-3fde738-20250918',
        ...dependencies,
      },
    })

    it('should memoize Components', async () => {
      const browser = await next.browser('/')

      expect(await browser.eval('window.staticChildRenders')).toEqual(1)
      expect(
        await browser.elementByCss('[data-testid="parent-commits"]').text()
      ).toEqual('Parent commits: 1')

      await browser.elementByCss('button').click()
      await browser.elementByCss('button').click()
      await browser.elementByCss('button').click()

      expect(await browser.eval('window.staticChildRenders')).toEqual(1)
      expect(
        await browser.elementByCss('[data-testid="parent-commits"]').text()
      ).toEqual('Parent commits: 4')
    })

    it('should work with a library that uses the react-server condition', async () => {
      const outputIndex = next.cliOutput.length
      await next.render('/library-react-server')

      const cliOutput = stripAnsi(next.cliOutput.slice(outputIndex))
      expect(cliOutput).not.toMatch(/error/)
    })

    it('should work with a library using use client', async () => {
      const outputIndex = next.cliOutput.length
      await next.render('/library-client')

      const cliOutput = stripAnsi(next.cliOutput.slice(outputIndex))
      expect(cliOutput).not.toMatch(/error/)
    })

    it('should name functions in dev', async () => {
      const browser = await next.browser('/function-naming')
      await browser.waitForElementByCss(
        '[data-testid="call-frame"][aria-busy="false"]',
        5000
      )

      const callFrame = await browser
        .elementByCss('[data-testid="call-frame"]')
        .text()
      const devFunctionName =
        variant === 'babelrc' && !isTurbopack
          ? // next/babel transpiles away arrow functions defeating the React Compiler naming
            // TODO: Does Webpack or Turbopack get the Babel config right?
            'PageUseEffect'
          : // expected naming heuristic from React Compiler. This may change in future.
            // Just make sure this is the heuristic from the React Compiler not something else.
            'Page[useEffect()]'
      if (isNextDev) {
        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "description": "test-top-frame",
           "environmentLabel": null,
           "label": "Console Error",
           "source": "app/function-naming/page.tsx (8:19) @ ${devFunctionName}
         >  8 |     const error = new Error('test-top-frame')
              |                   ^",
           "stack": [
             "${devFunctionName} app/function-naming/page.tsx (8:19)",
           ],
         }
        `)
        // We care more about the sourcemapped frame in the Redbox.
        // This assertion is only here to show that the negative assertion below is valid.
        expect(normalizeCodeLocInfo(callFrame)).toEqual(
          `    at ${devFunctionName} (**)`
        )
      } else {
        expect(normalizeCodeLocInfo(callFrame)).not.toEqual(
          `    at ${devFunctionName} (**)`
        )
      }
    })

    it('throws if the React Compiler is used in a React Server environment', async () => {
      const outputIndex = next.cliOutput.length
      const browser = await next.browser('/library-missing-react-server')

      const cliOutput = normalizeCodeLocInfo(
        stripAnsi(next.cliOutput.slice(outputIndex))
      )
      if (isNextDev) {
        // TODO(NDX-663): Unhelpful error message.
        // Should say that the library should have a react-server entrypoint that doesn't use the React Compiler.
        expect(cliOutput).toContain(
          "⨯ TypeError: Cannot read properties of undefined (reading 'H')" +
            // location not important. Just that this is the only frame.
            // TODO: Stack should start at product code. Possible React limitation.
            '\n    at Container (**)' +
            // Will just point to original file location
            '\n  2 |'
        )

        await assertHasRedbox(browser)
      }
    })
  }
)
