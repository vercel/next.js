import { writeFile } from 'fs-extra'
import { fetchViaHTTP, findPort, killApp, launchApp } from 'next-test-utils'
import { join } from 'path'
import stripAnsi from 'strip-ansi'

describe('Middleware dev errors', () => {
  const appDir = join(__dirname, '..')
  const middlewareFile = join(appDir, 'middleware.js')

  afterEach(() =>
    writeFile(middlewareFile, '// this will be populated by each test\n')
  )

  describe.each([
    {
      title: 'throwing synchronously during execution',
      code: `export default function () {
              throw new Error('boom')
            }`,
      expectedError: `error - \\(middleware\\)/middleware.js \\(\\d+:\\d+\\) @ Object.__WEBPACK_DEFAULT_EXPORT__ \\[as handler\\]
Error: boom`,
    },
    {
      title: 'throwing asynchronously during execution',
      code: `import { NextResponse } from 'next/server'
            async function throwError() {
              throw new Error('async boom!')
            }
            export default function () {
              throwError()
              return NextResponse.next()
            }`,
      expectedError: `error - \\(middleware\\)/middleware.js \\(\\d+:\\d+\\) @ throwError
Error: async boom!`,
    },
    {
      title: 'running invalid dynamic code with eval',
      code: `import { NextResponse } from 'next/server'

                    export default function () {
                      eval('test')
                      return NextResponse.next()
                    }`,
      expectedError: `error - \\(middleware\\)/middleware.js \\(\\d+:\\d+\\) @ eval
ReferenceError: test is not defined`,
    },
    {
      title: 'running invalid dynamic code with Function constructor',
      code: `import { NextResponse } from 'next/server'

                    export default function () {
                      new Function('test')()
                      return NextResponse.next()
                    }`,
      expectedError: `error - \\(middleware\\)/middleware.js \\(\\d+:\\d+\\) @ Object.__WEBPACK_DEFAULT_EXPORT__ \\[as handler\\]
ReferenceError: test is not defined`,
    },
    {
      title: 'throwing error while loading middleware',
      code: `import { NextResponse } from 'next/server'
                    throw new Error('booooom!')
                    export default function () {
                      return NextResponse.next()
                    }`,
      expectedError: `error - \\(middleware\\)/middleware.js \\(\\d+:\\d+\\) @ <unknown>
Error: booooom!`,
    },
    {
      title: 'throwing error while loading dependencies',
      code: `import { NextResponse } from 'next/server'
                    import './lib/unparseable'

                    export default function () {
                      return NextResponse.next()
                    }`,
      expectedError: `error - \\(middleware\\)/lib/unparseable.js \\(\\d+:\\d+\\) @ <unknown>
Error: This file synchronously fails while loading`,
    },
    {
      title: 'with unhandled rejection during middleware loading',
      code: `import { NextResponse } from 'next/server'
                (async function(){
                  throw new Error('you shall see me')
                })()

                export default function () {
                  return NextResponse.next()
                }`,
      expectedError: `error - \\(middleware\\)/middleware.js \\(\\d+:\\d+\\) @ eval
Error: you shall see me`,
    },
    {
      title: 'with unhandled rejection during dependency loading',
      code: `import { NextResponse } from 'next/server'
                import './lib/unhandled'

                export default function () {
                  return NextResponse.next()
                }`,
      expectedError: `error - \\(middleware\\)/lib/unhandled.js \\(\\d+:\\d+\\) @ Timeout.eval \\[as _onTimeout\\]
Error: This file asynchronously fails while loading`,
    },
  ])('given a middleware $title', ({ code, expectedError }) => {
    let app = null
    let port = 0
    let output = ''

    beforeAll(async () => {
      await writeFile(middlewareFile, code)
      port = await findPort()
      app = await launchApp(appDir, port, {
        env: {
          __NEXT_TEST_WITH_DEVTOOL: 1,
        },
        onStdout(msg) {
          output += msg
        },
        onStderr(msg) {
          output += msg
        },
      })
    })

    afterAll(() => killApp(app))

    it('displays clean error in logs', async () => {
      await fetchViaHTTP(port, '/')
      output = stripAnsi(output)
      expect(output).toMatch(new RegExp(expectedError, 'm'))
      expect(output).not.toContain(
        'webpack-internal:///(middleware)/./middleware.js'
      )
    })
  })
})
