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

let getStderr

const runTests = () => {
  it('should error when source length is exceeded', async () => {
    await writeMiddleware([{ source: `/${Array(4096).join('a')}` }])
    const stderr = await getStderr()
    expect(stderr).toContain(
      '`source` exceeds max built length of 4096 for route {"source":"/aaaaaaaaaaaaaaaaaa'
    )
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

    expect(stderr).toContain(`\`source\` is missing for route {}`)

    expect(stderr).toContain(
      `\`source\` is not a string for route {"source":123}`
    )

    expect(stderr).toContain(
      `\`source\` does not start with / for route {"source":"hello"}`
    )

    expect(stderr).toContain(
      `invalid field: destination for route {"source":"/hello","destination":"/not-allowed"}`
    )

    expect(stderr).toContain(
      `The route null is not a valid object with \`source\``
    )

    expect(stderr).toContain('Invalid `has` item:')
    expect(stderr).toContain(
      `invalid type "cookiee" for {"type":"cookiee","key":"loggedIn"}`
    )
    expect(stderr).toContain(
      `invalid \`has\` item found for route {"source":"/hello","has":[{"type":"cookiee","key":"loggedIn"}]}`
    )

    expect(stderr).toContain('Invalid `has` items:')
    expect(stderr).toContain(
      `invalid type "headerr", invalid key "undefined" for {"type":"headerr"}`
    )
    expect(stderr).toContain(
      `invalid type "queryr" for {"type":"queryr","key":"hello"}`
    )
    expect(stderr).toContain(
      `invalid \`has\` items found for route {"source":"/hello","has":[{"type":"headerr"},{"type":"queryr","key":"hello"}]}`
    )
    expect(stderr).toContain(`Valid \`has\` object shape is {`)
    expect(stderr).toContain(
      `invalid field: basePath for route {"source":"/hello","basePath":false}`
    )
    expect(stderr).toContain(
      '`locale` must be undefined or false for route {"source":"/hello","locale":true}'
    )
  })
}

describe('Errors on invalid custom middleware matchers', () => {
  afterAll(() => fs.remove(middlewarePath))

  describe('dev mode', () => {
    beforeAll(() => {
      getStderr = async () => {
        let stderr = ''
        const port = await findPort()
        await launchApp(appDir, port, {
          onStderr(msg) {
            stderr += msg
          },
        })
        await fetchViaHTTP(port, '/').catch(() => {})
        return stderr
      }
    })

    runTests()
  })
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    beforeAll(() => {
      getStderr = async () => {
        const { stderr } = await nextBuild(appDir, [], { stderr: true })
        return stderr
      }
    })

    runTests()
  })
})
