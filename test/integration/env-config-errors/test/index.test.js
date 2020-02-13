/* eslint-env jest */
/* global jasmine */
import fs from 'fs-extra'
import { join } from 'path'
import { nextBuild, findPort, launchApp, killApp } from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

const appDir = join(__dirname, '..')
const envFile = join(appDir, 'env.json')
const nextConfig = join(appDir, 'next.config.js')

const build = async (isDev = false) => {
  let output = ''
  if (isDev) {
    const app = await launchApp(appDir, await findPort(), {
      onStdout(msg) {
        output += msg || ''
      },
      onStderr(msg) {
        output += msg || ''
      },
    })
    const timeout = setTimeout(() => killApp(app).catch(() => {}), 5 * 1000)
    await app
    clearTimeout(timeout)
  } else {
    const { stdout, stderr } = await nextBuild(appDir, [], {
      stderr: true,
      stdout: true,
    })
    output = (stdout || '') + '\n\n' + (stderr || '')
  }
  return output
}

const runTests = (isDev = false) => {
  it('should error for missing required values', async () => {
    await fs.writeFile(
      envFile,
      JSON.stringify({
        NOTION_KEY: {
          description: 'Notion API key',
          required: true,
        },
        APP_TITLE: {
          description: 'some title',
          required: false,
        },
        SENTRY_DSN: {
          description: 'our sentry dsn',
          env: {
            [isDev ? 'development' : 'production']: {
              required: true,
            },
            [!isDev ? 'development' : 'production']: {
              required: false,
            },
          },
        },
        DATABASE_ACCESS_KEY: {
          description: 'used to access our database for SSG',
        },
      })
    )
    const output = await build(isDev)
    console.log(output)

    expect(output).toContain(
      'Required environment items from `env.json` are missing: NOTION_KEY, SENTRY_DSN'
    )
  })

  it('should not error for missing required values if default values provided', async () => {
    await fs.writeFile(
      envFile,
      JSON.stringify({
        NOTION_KEY: {
          description: 'Notion API key',
          value: 'notion',
          required: true,
        },
        APP_TITLE: {
          description: 'some title',
          required: false,
        },
        SENTRY_DSN: {
          description: 'our sentry dsn',
          env: {
            [isDev ? 'development' : 'production']: {
              value: 'sentry',
              required: true,
            },
            [!isDev ? 'development' : 'production']: {
              required: false,
            },
          },
        },
        DATABASE_ACCESS_KEY: {
          description: 'used to access our database for SSG',
        },
      })
    )
    const output = await build(isDev)

    expect(output).not.toContain(
      'Required environment items from `env.json` are missing:'
    )
  })
}

describe('Env Config', () => {
  afterEach(() => fs.remove(envFile))

  describe('dev mode', () => {
    runTests(true)
  })

  describe('server mode', () => {
    runTests()
  })

  describe('serverless mode', () => {
    beforeAll(async () => {
      await fs.writeFile(
        nextConfig,
        `module.exports = { target: 'experimental-serverless-trace' }`
      )
    })
    afterAll(async () => {
      await fs.remove(nextConfig)
    })

    runTests()
  })
})
