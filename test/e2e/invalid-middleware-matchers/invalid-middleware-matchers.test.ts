import { nextTestSetup } from 'e2e-utils'

describe('Errors on invalid custom middleware matchers', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  afterEach(async () => {
    await next.deleteFile('middleware.js')
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

  it('should error when source length is exceeded', async () => {
    await writeMiddleware([{ source: `/${Array(4096).join('a')}` }])
    await next.build()
    expect(next.cliOutput).toContain(
      'exceeds max built length of 4096 for route'
    )
  })

  it('should error during build for invalid matchers', async () => {
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
    await next.build()
    const stderr = next.cliOutput

    if (process.env.IS_TURBOPACK_TEST && !isNextDev) {
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
      expect(stderr).toContain('source must start with / at "matcher[2]"')
      expect(stderr).toContain(
        'Unrecognized key(s) in object: \'destination\' at "matcher[3]"'
      )
      expect(stderr).toContain('Expected string, received null at "matcher[4]"')
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
    }
  })
})
