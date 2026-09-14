import { nextTestSetup, isNextDev, isNextStart } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('Errors on invalid custom routes', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })
  if (skipped) return

  const writeConfig = async (routes: any, type = 'redirects') => {
    await next.patchFile(
      'next.config.js',
      `
      module.exports = {
        async ${type}() {
          return ${JSON.stringify(routes)}
        }
      }
    `
    )
  }

  /**
   * Dev: start server, hit `/`, assert on streaming `cliOutput` (like integration `launchApp` + stderr).
   * Start: run `next build` and assert on build output (like integration `nextBuild` + stderr).
   */
  async function captureStderr(
    mode: 'dev' | 'start',
    assertions: (getOutput: () => string) => void | Promise<void>
  ) {
    if (mode === 'dev') {
      await next.start()
      try {
        await next.fetch('/').catch(() => {})
        await retry(async () => {
          await assertions(() => next.cliOutput)
        })
      } finally {
        await next.stop()
      }
    } else {
      const { cliOutput } = await next.build()
      const fixed = cliOutput
      await retry(async () => {
        await assertions(() => fixed)
      })
    }
  }

  afterAll(async () => {
    await next.patchFile('next.config.js', `module.exports = {}\n`)
  })

  function runTests(mode: 'dev' | 'start') {
    it('should error when empty headers array is present on header item', async () => {
      await writeConfig(
        [
          {
            source: `/:path*`,
            headers: [],
          },
        ],
        'headers'
      )
      await captureStderr(mode, (getOutput) => {
        const stderr = getOutput()
        expect(stderr).toContain(
          '`headers` field cannot be empty for route {"source":"/:path*"'
        )
      })
    })

    it('should error when source and destination length is exceeded', async () => {
      await writeConfig(
        [
          {
            source: `/${Array(4096).join('a')}`,
            destination: `/another`,
            permanent: false,
          },
          {
            source: `/`,
            destination: `/${Array(4096).join('a')}`,
            permanent: false,
          },
        ],
        'redirects'
      )
      await captureStderr(mode, (getOutput) => {
        const stderr = getOutput()
        expect(stderr).toContain(
          '`source` exceeds max built length of 4096 for route {"source":"/aaaaaaaaaaaaaaaaaa'
        )
        expect(stderr).toContain(
          '`destination` exceeds max built length of 4096 for route {"source":"/","destination":"/aaaa'
        )
      })
    })

    it('should error during next build for invalid redirects', async () => {
      await writeConfig(
        [
          {
            source: '/hello',
            permanent: false,
          },
          {
            source: 123,
            destination: '/another',
            permanent: false,
          },
          {
            source: '/hello',
            destination: '/another',
            statusCode: '301',
          },
          {
            source: '/hello',
            destination: '/another',
            statusCode: 404,
          },
          {
            source: '/hello',
            destination: '/another',
            permanent: 'yes',
          },
          {
            source: '/hello/world/(.*)',
            destination: '/:0',
            permanent: true,
          },
          null,
          'string',
          {
            source: '/hello',
            destination: '/another',
            has: [
              {
                type: 'cookiee',
                key: 'loggedIn',
              },
            ],
            permanent: false,
          },
          {
            source: '/hello',
            destination: '/another',
            permanent: false,
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
        ],
        'redirects'
      )
      await captureStderr(mode, (getOutput) => {
        const stderr = getOutput()
        expect(stderr).toContain(
          `\`destination\` is missing for route {"source":"/hello","permanent":false}`
        )
        expect(stderr).toContain(
          `\`source\` is not a string for route {"source":123,"destination":"/another","permanent":false}`
        )
        expect(stderr).toContain(
          `\`statusCode\` is not undefined or valid statusCode for route {"source":"/hello","destination":"/another","statusCode":"301"}`
        )
        expect(stderr).toContain(
          `\`statusCode\` is not undefined or valid statusCode for route {"source":"/hello","destination":"/another","statusCode":404}`
        )
        expect(stderr).toContain(
          `\`permanent\` is not set to \`true\` or \`false\` for route {"source":"/hello","destination":"/another","permanent":"yes"}`
        )
        expect(stderr).toContain(
          `\`destination\` has unnamed params :0 for route {"source":"/hello/world/(.*)","destination":"/:0","permanent":true}`
        )
        expect(stderr).toContain(
          `The route null is not a valid object with \`source\` and \`destination\``
        )
        expect(stderr).toContain(
          `The route "string" is not a valid object with \`source\` and \`destination\``
        )
        expect(stderr).toContain('Invalid `has` item:')
        expect(stderr).toContain(
          `invalid type "cookiee" for {"type":"cookiee","key":"loggedIn"}`
        )
        expect(stderr).toContain(
          `invalid \`has\` item found for route {"source":"/hello","destination":"/another","has":[{"type":"cookiee","key":"loggedIn"}],"permanent":false}`
        )
        expect(stderr).toContain('Invalid `has` items:')
        expect(stderr).toContain(
          `invalid type "headerr", invalid key "undefined" for {"type":"headerr"}`
        )
        expect(stderr).toContain(
          `invalid type "queryr" for {"type":"queryr","key":"hello"}`
        )
        expect(stderr).toContain(
          `invalid \`has\` items found for route {"source":"/hello","destination":"/another","permanent":false,"has":[{"type":"headerr"},{"type":"queryr","key":"hello"}]}`
        )
        expect(stderr).toContain(`Valid \`has\` object shape is {`)
        expect(stderr).toContain('Invalid redirects found')
      })
    })

    it('should error during next build for invalid rewrites', async () => {
      await writeConfig(
        [
          {
            source: '/hello',
          },
          {
            source: 123,
            destination: '/another',
          },
          {
            source: '/hello',
            destination: '/another',
            headers: 'not-allowed',
          },
          {
            source: 'hello',
            destination: '/another',
          },
          {
            source: '/hello',
            destination: 'another',
          },
          {
            source: '/feedback/(?!general)',
            destination: '/feedback/general',
          },
          {
            source: '/hello/world/(.*)',
            destination: '/:0',
          },
          {
            source: '/hello',
            destination: '/world',
            basePath: false,
          },
          null,
          'string',
          {
            source: '/hello',
            destination: '/another',
            has: [
              {
                type: 'cookiee',
                key: 'loggedIn',
              },
            ],
          },
          {
            source: '/hello',
            destination: '/another',
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
        ],
        'rewrites'
      )
      await captureStderr(mode, (getOutput) => {
        const stderr = getOutput()
        expect(stderr).toContain(
          `\`destination\` is missing for route {"source":"/hello"}`
        )
        expect(stderr).toContain(
          `\`source\` is not a string for route {"source":123,"destination":"/another"}`
        )
        expect(stderr).toContain(
          `invalid field: headers for route {"source":"/hello","destination":"/another","headers":"not-allowed"}`
        )
        expect(stderr).toContain(
          `\`source\` does not start with / for route {"source":"hello","destination":"/another"}`
        )
        expect(stderr).toContain(
          `\`destination\` does not start with \`/\`, \`http://\`, or \`https://\` for route {"source":"/hello","destination":"another"}`
        )
        expect(stderr).toContain(
          `Error parsing \`/feedback/(?!general)\` https://nextjs.org/docs/messages/invalid-route-source`
        )
        expect(stderr).toContain(
          `\`destination\` has unnamed params :0 for route {"source":"/hello/world/(.*)","destination":"/:0"}`
        )
        expect(stderr).toContain(
          `The route null is not a valid object with \`source\` and \`destination\``
        )
        expect(stderr).toContain(
          `The route "string" is not a valid object with \`source\` and \`destination\``
        )
        expect(stderr).toContain(`Reason: Pattern cannot start with "?" at 11`)
        expect(stderr).toContain(`/feedback/(?!general)`)
        expect(stderr).not.toContain(
          'Valid redirect statusCode values are 301, 302, 303, 307, 308'
        )
        expect(stderr).toContain(
          `The route /hello rewrites urls outside of the basePath. Please use a destination that starts with \`http://\` or \`https://\` https://nextjs.org/docs/messages/invalid-external-rewrite`
        )
        expect(stderr).toContain('Invalid `has` item:')
        expect(stderr).toContain(
          `invalid type "cookiee" for {"type":"cookiee","key":"loggedIn"}`
        )
        expect(stderr).toContain(
          `invalid \`has\` item found for route {"source":"/hello","destination":"/another","has":[{"type":"cookiee","key":"loggedIn"}]}`
        )
        expect(stderr).toContain('Invalid `has` items:')
        expect(stderr).toContain(
          `invalid type "headerr", invalid key "undefined" for {"type":"headerr"}`
        )
        expect(stderr).toContain(
          `invalid type "queryr" for {"type":"queryr","key":"hello"}`
        )
        expect(stderr).toContain(
          `invalid \`has\` items found for route {"source":"/hello","destination":"/another","has":[{"type":"headerr"},{"type":"queryr","key":"hello"}]}`
        )
        expect(stderr).toContain(`Valid \`has\` object shape is {`)
        expect(stderr).toContain('Invalid rewrites found')
      })
    })

    it('should error during next build for invalid headers', async () => {
      await writeConfig(
        [
          {
            headers: [
              {
                'x-first': 'first',
              },
            ],
          },
          {
            source: '/hello',
            headers: {
              'x-first': 'first',
            },
          },
          {
            source: '/again',
            headers: [
              {
                value: 'idk',
              },
            ],
          },
          {
            source: '/again',
            headers: [
              {
                key: 'idk',
              },
            ],
          },
          {
            source: '/again',
            destination: '/another',
            headers: [
              {
                key: 'x-first',
                value: 'idk',
              },
            ],
          },
          {
            source: '/valid-header',
            headers: [
              {
                key: 'x-first',
                value: 'first',
              },
              {
                key: 'x-another',
                value: 'again',
              },
            ],
          },
          null,
          'string',
          {
            source: '/hello',
            has: [
              {
                type: 'cookiee',
                key: 'loggedIn',
              },
            ],
            headers: [
              {
                key: 'x-hello',
                value: 'world',
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
            headers: [
              {
                key: 'x-hello',
                value: 'world',
              },
            ],
          },
        ],
        'headers'
      )
      await captureStderr(mode, (getOutput) => {
        const stderr = getOutput()
        expect(stderr).toContain(
          '`source` is missing, `key` in header item must be string for route {"headers":[{"x-first":"first"}]}'
        )
        expect(stderr).toContain(
          '`headers` field must be an array for route {"source":"/hello","headers":{"x-first":"first"}}'
        )
        expect(stderr).toContain(
          '`key` in header item must be string for route {"source":"/again","headers":[{"value":"idk"}]}'
        )
        expect(stderr).toContain(
          '`value` in header item must be string for route {"source":"/again","headers":[{"key":"idk"}]}'
        )
        expect(stderr).toContain(
          'invalid field: destination for route {"source":"/again","destination":"/another","headers":[{"key":"x-first","value":"idk"}]}'
        )
        expect(stderr).toContain(
          `The route null is not a valid object with \`source\` and \`headers\``
        )
        expect(stderr).toContain(
          `The route "string" is not a valid object with \`source\` and \`headers\``
        )
        expect(stderr).toContain('Invalid `has` item:')
        expect(stderr).toContain(
          `invalid type "cookiee" for {"type":"cookiee","key":"loggedIn"}`
        )
        expect(stderr).toContain(
          `invalid \`has\` item found for route {"source":"/hello","has":[{"type":"cookiee","key":"loggedIn"}],"headers":[{"key":"x-hello","value":"world"}]}`
        )
        expect(stderr).toContain('Invalid `has` items:')
        expect(stderr).toContain(
          `invalid type "headerr", invalid key "undefined" for {"type":"headerr"}`
        )
        expect(stderr).toContain(
          `invalid type "queryr" for {"type":"queryr","key":"hello"}`
        )
        expect(stderr).toContain(
          `invalid \`has\` items found for route {"source":"/hello","has":[{"type":"headerr"},{"type":"queryr","key":"hello"}],"headers":[{"key":"x-hello","value":"world"}]}`
        )
        expect(stderr).toContain(`Valid \`has\` object shape is {`)
        expect(stderr).not.toContain('/valid-header')
      })
    })

    it('should show formatted error for redirect source parse fail', async () => {
      await writeConfig(
        [
          {
            source: '/feedback/(?!general)',
            destination: '/feedback/general',
            permanent: false,
          },
          {
            source: '/learning/?',
            destination: '/learning',
            permanent: true,
          },
        ],
        'redirects'
      )
      await captureStderr(mode, (getOutput) => {
        const stderr = getOutput()
        expect(stderr).toContain(
          `Error parsing \`/feedback/(?!general)\` https://nextjs.org/docs/messages/invalid-route-source`
        )
        expect(stderr).toContain(`Reason: Pattern cannot start with "?" at 11`)
        expect(stderr).toContain(`/feedback/(?!general)`)
        expect(stderr).toContain(
          `Error parsing \`/learning/?\` https://nextjs.org/docs/messages/invalid-route-source`
        )
        expect(stderr).toContain(
          `Reason: Unexpected MODIFIER at 10, expected END`
        )
        expect(stderr).toContain(`/learning/?`)
      })
    })

    it('should show valid error when non-array is returned from rewrites', async () => {
      await writeConfig(
        {
          source: '/feedback/(?!general)',
          destination: '/feedback/general',
        },
        'rewrites'
      )
      await captureStderr(mode, (getOutput) => {
        const stderr = getOutput()
        expect(stderr).toContain(
          `rewrites must return an array, received object`
        )
      })
    })

    it('should show valid error when non-array is returned from redirects', async () => {
      await writeConfig(false, 'redirects')
      await captureStderr(mode, (getOutput) => {
        const stderr = getOutput()
        expect(stderr).toContain(
          `redirects must return an array, received boolean`
        )
      })
    })

    it('should show valid error when non-array is returned from headers', async () => {
      await writeConfig(undefined, 'headers')
      await captureStderr(mode, (getOutput) => {
        const stderr = getOutput()
        expect(stderr).toContain(
          `headers must return an array, received undefined`
        )
      })
    })

    it('should show valid error when segments not in source are used in destination', async () => {
      await writeConfig(
        [
          {
            source: '/feedback/:type',
            destination: '/feedback/:id',
          },
        ],
        'rewrites'
      )
      await captureStderr(mode, (getOutput) => {
        const stderr = getOutput()
        expect(stderr).toContain(
          `\`destination\` has segments not in \`source\` or \`has\` (id) for route {"source":"/feedback/:type","destination":"/feedback/:id"}`
        )
      })
    })
  }

  ;(isNextDev ? describe : describe.skip)('development mode', () => {
    runTests('dev')
  })
  ;(isNextStart ? describe : describe.skip)('production mode', () => {
    runTests('start')
  })
})
