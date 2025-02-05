import { nextTestSetup, FileRef } from 'e2e-utils'
import { assertHasRedbox, retry } from 'next-test-utils'
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

describe.each(
  ['default', process.env.TURBOPACK ? undefined : 'babelrc'].filter(Boolean)
)('react-compiler %s', (variant) => {
  const dependencies = (global as any).isNextDeploy
    ? // `link` is incompatible with the npm version used when this test is deployed
      {
        'reference-library': 'file:./reference-library',
      }
    : {
        'reference-library': 'link:./reference-library',
      }
  const { next, isNextDev } = nextTestSetup({
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

    dependencies: {
      'babel-plugin-react-compiler': '19.0.0-beta-e552027-20250112',
      ...dependencies,
    },
  })

  it('should show an experimental warning', async () => {
    await retry(() => {
      expect(next.cliOutput).toContain('Experiments (use with caution)')
      expect(stripAnsi(next.cliOutput)).toContain('✓ reactCompiler')
    })
  })

  it('should render', async () => {
    const browser = await next.browser('/')

    await retry(async () => {
      const text = await browser
        .elementByCss('#react-compiler-enabled-message')
        .text()
      expect(text).toMatch(/React compiler is enabled with \d+ memo slots/)
    })
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
        '' +
          "\n ⨯ TypeError: Cannot read properties of undefined (reading 'H')" +
          // location not important. Just that this is the only frame.
          // TODO: Stack should start at product code. Possible React limitation.
          '\n    at Container (**)' +
          // Will just point to original file location
          '\n  2 |'
      )

      await assertHasRedbox(browser)
    }
  })
})
