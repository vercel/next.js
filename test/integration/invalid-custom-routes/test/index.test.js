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
    `\`destination\` is missing for route {"source":"/hello"}`
  )

  expect(stderr).toContain(
    `\`source\` is not a string for route {"source":123,"destination":"/another"}`
  )

  expect(stderr).toContain(
    `\`statusCode\` is not undefined or valid statusCode for route {"source":"/hello","destination":"/another","statusCode":"301"}`
  )

  expect(stderr).toContain(
    `\`statusCode\` is not undefined or valid statusCode for route {"source":"/hello","destination":"/another","statusCode":404}`
  )

  expect(stderr).toContain(
    'Valid redirect statusCode values are 301, 302, 303, 307, 308'
  )
  expect(stderr).toContain('Invalid redirects found')
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
]

const invalidRewriteAssertions = (stderr = '') => {
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
    `\`destination\` does not start with / for route {"source":"/hello","destination":"another"}`
  )

  expect(stderr).not.toContain(
    'Valid redirect statusCode values are 301, 302, 303, 307, 308'
  )
  expect(stderr).toContain('Invalid rewrites found')
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
