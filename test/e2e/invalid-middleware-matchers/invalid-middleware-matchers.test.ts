import { nextTestSetup, isNextDev, isNextStart } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('Errors on invalid custom middleware matchers', () => {
  const { next, isTurbopack, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })
  if (skipped) return

  afterEach(async () => {
    await next.deleteFile('middleware.js').catch(() => {})
    await next.stop().catch(() => {})
  })

  function writeMiddleware(matchers: any) {
    return next.patchFile(
      'middleware.js',
      `
      import { NextResponse } from 'next/server'

      export default function middleware() {
        return NextResponse.next()
      }

      export const config = {
        matcher: ${JSON.stringify(matchers)},
      }
    `
    )
  }

  /** Same branching as integration `runTests(getStderr, isDev)`. */
  function assertInvalidMatchersStderr(stderr: string, isDev: boolean) {
    if (isTurbopack && !isDev) {
      expect(stderr).toContain('Turbopack build failed with 10 errors')

      let matches = 0
      matches += stderr.includes('Missing `source` in `matcher[0]` object')
        ? 1
        : 0
      matches += stderr.includes('Missing `source` in `matcher[1]` object')
        ? 1
        : 0
      matches += stderr.includes('Unexpected property in `matcher[3]` object')
        ? 1
        : 0
      matches += stderr.includes(
        'Entry `matcher[4]` need to be static strings or static objects.'
      )
        ? 1
        : 0
      matches += stderr.includes(
        "`matcher[5].has[0].type` must be one of the strings: 'header', 'cookie', 'query', 'host'"
      )
        ? 1
        : 0
      matches += stderr.includes(
        "`matcher[6].has[0].type` must be one of the strings: 'header', 'cookie', 'query', 'host'"
      )
        ? 1
        : 0
      matches += stderr.includes('Unexpected property in `matcher[7]` object')
        ? 1
        : 0
      matches += stderr.includes(
        '`locale` in `matcher[8]` object must be false or undefined'
      )
        ? 1
        : 0

      if (matches < 4) {
        throw new Error('Missing error messages for stderr:\n' + stderr)
      }
    } else {
      expect(stderr).toContain(
        'Expected string, received object at "matcher[0]", or source is required at "matcher[0].source"'
      )
      expect(stderr).toContain(
        'Expected string, received number at "matcher[1].source"'
      )
      expect(stderr).toContain(
        'Unrecognized key(s) in object: \'destination\' at "matcher[3]"'
      )
      expect(stderr).toContain('Expected string, received null at "matcher[4]"')
      expect(stderr).toContain(
        "Expected 'header' | 'query' | 'cookie' | 'host' at \"matcher[6].has[1].type\""
      )
      expect(stderr).toContain(
        "Expected 'header' | 'query' | 'cookie' | 'host' at \"matcher[5].has[0].type\""
      )
      expect(stderr).toContain(
        "Expected 'header' | 'query' | 'cookie' | 'host' at \"matcher[6].has[0].type\""
      )
      expect(stderr).toContain(
        "Expected 'header' | 'query' | 'cookie' | 'host' at \"matcher[6].has[1].type\""
      )
      expect(stderr).toContain(
        'Unrecognized key(s) in object: \'basePath\' at "matcher[7]"'
      )
      expect(stderr).toContain(
        'Expected string, received object at "matcher[8]", or Invalid literal value, expected false at "matcher[8].locale", or Expected undefined, received boolean at "matcher[8].locale"'
      )

      // TODO currently not covered by Turbopack
      expect(stderr).toContain('source must start with / at "matcher[2]"')
    }
  }

  function runTests(mode: 'dev' | 'start') {
    const isDevMode = mode === 'dev'

    it('should error when source length is exceeded', async () => {
      await writeMiddleware([{ source: `/${Array(4096).join('a')}` }])
      if (isDevMode) {
        await next.start()
        try {
          await next.fetch('/').catch(() => {})
          await retry(() => {
            expect(next.cliOutput).toContain(
              'exceeds max built length of 4096 for route'
            )
          })
        } finally {
          await next.stop()
        }
      } else {
        await next.build()
        expect(next.cliOutput).toContain(
          'exceeds max built length of 4096 for route'
        )
      }
    })

    it('should error during next build for invalid matchers', async () => {
      await writeMiddleware([
        {
          // missing source
        },
        {
          // invalid source
          source: 123,
        },
        // missing forward slash in source
        'hello',
        {
          // extra field
          source: '/hello',
          destination: '/not-allowed',
        },
        // invalid objects
        null,
        // invalid has items
        {
          source: '/hello',
          has: [
            {
              type: 'cookiee',
              key: 'loggedIn',
            },
          ],
        },
        {
          source: '/hello',
          has: [
            {
              type: 'headerr',
            },
            {
              type: 'queryr',
              key: 'hello',
            },
          ],
        },
        {
          source: '/hello',
          basePath: false,
        },
        {
          source: '/hello',
          locale: true,
        },
      ])

      if (isDevMode) {
        await next.start()
        try {
          await next.fetch('/').catch(() => {})
          await retry(async () => {
            assertInvalidMatchersStderr(next.cliOutput, isDevMode)
          })
        } finally {
          await next.stop()
        }
      } else {
        await next.build()
        assertInvalidMatchersStderr(next.cliOutput, isDevMode)
      }
    })
  }

  ;(isNextDev ? describe : describe.skip)('development mode', () => {
    runTests('dev')
  })
  ;(isNextStart ? describe : describe.skip)('production mode', () => {
    runTests('start')
  })
})
