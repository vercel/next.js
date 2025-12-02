/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import { fetchViaHTTP, findPort, launchApp, nextBuild } from 'next-test-utils'

let appDir = join(__dirname, '..')
const middlewarePath = join(appDir, 'middleware.js')

const writeMiddleware = async (matchers) => {
  await fs.writeFile(
    middlewarePath,
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

const runTests = (getStderr, isDev) => {
  it('should error when source length is exceeded', async () => {
    await writeMiddleware([{ source: `/${Array(4096).join('a')}` }])
    const stderr = await getStderr()
    expect(stderr).toContain('exceeds max built length of 4096 for route')
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
    const stderr = await getStderr()

    // TODO the Javascript "/middleware contains invalid middleware config" error currently shadows the Turbopack one in development
    if (process.env.IS_TURBOPACK_TEST && !isDev) {
      expect(stderr).toContain('Turbopack build failed with 10 errors')

      let matches = 0
      matches += stderr.includes('Missing `source` in `matcher[0]` object')
      matches += stderr.includes('Missing `source` in `matcher[1]` object')
      matches += stderr.includes('Unexpected property in `matcher[3]` object')
      matches += stderr.includes(
        'Entry `matcher[4]` need to be static strings or static objects.'
      )
      matches += stderr.includes(
        "`matcher[5].has[0].type` must be one of the strings: 'header', 'cookie', 'query', 'host'"
      )
      matches += stderr.includes(
        "`matcher[6].has[0].type` must be one of the strings: 'header', 'cookie', 'query', 'host'"
      )
      matches += stderr.includes('Unexpected property in `matcher[7]` object')
      matches += stderr.includes(
        '`locale` in `matcher[8]` object must be false or undefined'
      )

      // TODO somehow stderr is doesn't contain everything. It does print 10 messages when running next standalone
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
  })
}

describe('Errors on invalid custom middleware matchers', () => {
  afterAll(() => fs.remove(middlewarePath))
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
      runTests(async () => {
        let stderr = ''
        const port = await findPort()
        await launchApp(appDir, port, {
          onStderr(msg) {
            stderr += msg
          },
        })
        await fetchViaHTTP(port, '/').catch(() => {})
        return stderr
      }, true)
    }
  )
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      runTests(async () => {
        const { stderr } = await nextBuild(appDir, [], { stderr: true })
        console.log(stderr)
        return stderr
      }, false)
    }
  )
})
