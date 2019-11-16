/* eslint-env jest */
/* global jasmine */
import fs from 'fs-extra'
import { join } from 'path'
import { launchApp, findPort, nextBuild } from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

let appDir = join(__dirname, '..')
const nextConfigPath = join(appDir, 'next.config.js')

const writeConfig = async (routes = [], type = 'redirects') => {
  await fs.writeFile(
    nextConfigPath,
    `
    module.exports = {
      experimental: {
        async ${type}() {
          return ${JSON.stringify(routes)}
        }
      }
    }
  `
  )
}

const invalidRedirects = [
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
]

const invalidRedirectAssertions = (stderr = '') => {
  expect(stderr).toContain(
    `Invalid keys found for route {"source":"/hello"} found: destination`
  )

  expect(stderr).toContain(
    `Invalid keys found for route {"source":123,"destination":"/another"} found: source`
  )

  expect(stderr).toContain(
    `Invalid keys found for route {"source":"/hello","destination":"/another","statusCode":"301"} found: statusCode`
  )

  expect(stderr).toContain(
    `Invalid keys found for route {"source":"/hello","destination":"/another","statusCode":404} found: statusCode`
  )

  expect(stderr).toContain(
    'redirect `source` and `destination` must be strings `statusCode` must be undefined or 301, 302, 303, 307, 308 and no other fields are allowed'
  )
}

const invalidRewrites = [
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
]

const invalidRewriteAssertions = (stderr = '') => {
  expect(stderr).toContain(
    `Invalid keys found for route {"source":"/hello"} found: destination`
  )

  expect(stderr).toContain(
    `Invalid keys found for route {"source":123,"destination":"/another"} found: source`
  )

  expect(stderr).toContain(
    `Invalid keys found for route {"source":"/hello","destination":"/another","headers":"not-allowed"} found: headers`
  )

  expect(stderr).toContain(
    'rewrite `source` and `destination` must be strings and no other fields are allowed'
  )
}

describe('Errors on invalid custom routes', () => {
  afterAll(() => fs.remove(nextConfigPath))

  it('should error during next build for invalid redirects', async () => {
    await writeConfig(invalidRedirects, 'redirects')
    const { stderr } = await nextBuild(appDir, undefined, { stderr: true })
    invalidRedirectAssertions(stderr)
  })

  it('should error during next build for invalid rewrites', async () => {
    await writeConfig(invalidRewrites, 'rewrites')
    const { stderr } = await nextBuild(appDir, undefined, { stderr: true })
    invalidRewriteAssertions(stderr)
  })

  it('should error during next dev for invalid redirects', async () => {
    await writeConfig(invalidRedirects, 'redirects')
    let stderr = ''
    await launchApp(appDir, await findPort(), {
      onStderr: msg => {
        stderr += msg
      },
    })
    invalidRedirectAssertions(stderr)
  })

  it('should error during next dev for invalid rewrites', async () => {
    await writeConfig(invalidRewrites, 'rewrites')
    let stderr = ''
    await launchApp(appDir, await findPort(), {
      onStderr: msg => {
        stderr += msg
      },
    })
    invalidRewriteAssertions(stderr)
  })
})
