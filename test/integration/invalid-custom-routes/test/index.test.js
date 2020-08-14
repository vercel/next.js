/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import { launchApp, findPort, nextBuild } from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

let appDir = join(__dirname, '..')
const nextConfigPath = join(appDir, 'next.config.js')

const writeConfig = async (routes, type = 'redirects') => {
  await fs.writeFile(
    nextConfigPath,
    `
    module.exports = {
      async ${type}() {
        return ${JSON.stringify(routes)}
      }
    }
  `
  )
}

let getStderr

const runTests = () => {
  it('should error during next build for invalid redirects', async () => {
    await writeConfig(
      [
        {
          // missing destination
          source: '/hello',
          permanent: false,
        },
        {
          // invalid source
          source: 123,
          destination: '/another',
          permanent: false,
        },
        {
          // invalid statusCode type
          source: '/hello',
          destination: '/another',
          statusCode: '301',
        },
        {
          // invalid statusCode
          source: '/hello',
          destination: '/another',
          statusCode: 404,
        },
        {
          // invalid permanent value
          source: '/hello',
          destination: '/another',
          permanent: 'yes',
        },
        {
          // unnamed in destination
          source: '/hello/world/(.*)',
          destination: '/:0',
          permanent: true,
        },
        // invalid objects
        null,
        'string',
      ],
      'redirects'
    )
    const stderr = await getStderr()

    expect(stderr).toContain(
      `\`destination\` is missing for route {"source":"/hello","permanent":false}`
    )

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
      `\`permanent\` is not set to \`true\` or \`false\` for route {"source":"/hello","destination":"/another","permanent":"yes"}`
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

    expect(stderr).toContain('Invalid redirects found')
  })

  it('should error during next build for invalid rewrites', async () => {
    await writeConfig(
      [
        {
          // missing destination
          source: '/hello',
        },
        {
          // invalid source
          source: 123,
          destination: '/another',
        },
        {
          // extra field
          source: '/hello',
          destination: '/another',
          headers: 'not-allowed',
        },
        {
          // missing forward slash in source
          source: 'hello',
          destination: '/another',
        },
        {
          // missing forward slash in destination
          source: '/hello',
          destination: 'another',
        },
        {
          source: '/feedback/(?!general)',
          destination: '/feedback/general',
        },
        {
          // unnamed in destination
          source: '/hello/world/(.*)',
          destination: '/:0',
        },
        {
          // basePath with relative destination
          source: '/hello',
          destination: '/world',
          basePath: false,
        },
        // invalid objects
        null,
        'string',
      ],
      'rewrites'
    )
    const stderr = await getStderr()

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
      `Error parsing \`/feedback/(?!general)\` https://err.sh/vercel/next.js/invalid-route-source`
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
      `The route /hello rewrites urls outside of the basePath. Please use a destination that starts with \`http://\` or \`https://\` https://err.sh/vercel/next.js/invalid-external-rewrite.md`
    )

    expect(stderr).toContain('Invalid rewrites found')
  })

  it('should error during next build for invalid headers', async () => {
    await writeConfig(
      [
        {
          // missing source
          headers: [
            {
              'x-first': 'first',
            },
          ],
        },
        {
          // invalid headers value
          source: '/hello',
          headers: {
            'x-first': 'first',
          },
        },
        {
          source: '/again',
          headers: [
            {
              // missing key
              value: 'idk',
            },
          ],
        },
        {
          source: '/again',
          headers: [
            {
              // missing value
              key: 'idk',
            },
          ],
        },
        {
          // non-allowed destination
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
          // valid one
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
        // invalid objects
        null,
        'string',
      ],
      'headers'
    )
    const stderr = await getStderr()

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

    expect(stderr).not.toContain('/valid-header')
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

    const stderr = await getStderr()

    expect(stderr).toContain(
      `Error parsing \`/feedback/(?!general)\` https://err.sh/vercel/next.js/invalid-route-source`
    )
    expect(stderr).toContain(`Reason: Pattern cannot start with "?" at 11`)
    expect(stderr).toContain(`/feedback/(?!general)`)

    expect(stderr).toContain(
      `Error parsing \`/learning/?\` https://err.sh/vercel/next.js/invalid-route-source`
    )
    expect(stderr).toContain(`Reason: Unexpected MODIFIER at 10, expected END`)
    expect(stderr).toContain(`/learning/?`)
  })

  it('should show valid error when non-array is returned from rewrites', async () => {
    await writeConfig(
      {
        source: '/feedback/(?!general)',
        destination: '/feedback/general',
      },
      'rewrites'
    )

    const stderr = await getStderr()

    expect(stderr).toContain(`rewrites must return an array, received object`)
  })

  it('should show valid error when non-array is returned from redirects', async () => {
    await writeConfig(false, 'redirects')

    const stderr = await getStderr()

    expect(stderr).toContain(`redirects must return an array, received boolean`)
  })

  it('should show valid error when non-array is returned from headers', async () => {
    await writeConfig(undefined, 'headers')

    const stderr = await getStderr()

    expect(stderr).toContain(`headers must return an array, received undefined`)
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

    const stderr = await getStderr()

    expect(stderr).toContain(
      `\`destination\` has segments not in \`source\` (id) for route {"source":"/feedback/:type","destination":"/feedback/:id"}`
    )
  })
}

describe('Errors on invalid custom routes', () => {
  afterAll(() => fs.remove(nextConfigPath))

  describe('dev mode', () => {
    beforeAll(() => {
      getStderr = async () => {
        let stderr = ''
        await launchApp(appDir, await findPort(), {
          onStderr: (msg) => {
            stderr += msg
          },
        })
        return stderr
      }
    })

    runTests()
  })

  describe('production mode', () => {
    beforeAll(() => {
      getStderr = async () => {
        const { stderr } = await nextBuild(appDir, [], { stderr: true })
        return stderr
      }
    })

    runTests()
  })
})
