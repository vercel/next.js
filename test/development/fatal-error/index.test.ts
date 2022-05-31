import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { check, retry, renderViaHTTP } from 'next-test-utils'
import { join } from 'path'

describe('fatal-error', () => {
  let next: NextInstance

  beforeEach(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(join(__dirname, 'app/pages')),
      },
      dependencies: {},
      skipStart: true,
    })
  })
  afterEach(() => next.destroy())

  it('should restart the dev server', async () => {
    // Make the dev server crash with a fatal error
    process.env.__NEXT_DEV_NODE_ARGS = '--max-old-space-size=50'
    await next.start()

    await check(
      () => next.cliOutput,
      /Restarting the server due to a fatal error/
    )

    await retry(() => {
      const numberOfServerStarts = next.cliOutput
        .split('\n')
        .filter((row) => /started server on .+, url: .+/.test(row)).length

      expect(numberOfServerStarts).toBeGreaterThan(1)
    })
  })

  describe('telemetry crash report', () => {
    test('without babel, custom webpack and successful compilation', async () => {
      // Make the dev server crash with a fatal error
      process.env.__NEXT_DEV_NODE_ARGS = '--max-old-space-size=50'
      process.env.NEXT_TELEMETRY_DEBUG = '1'
      await next.start()

      await check(() => next.cliOutput, /NEXT_DEV_CRASH_REPORT/)

      const event = /NEXT_DEV_CRASH_REPORT[\s\S]+?{([\s\S]+?)}/
        .exec(next.cliOutput)
        .pop()
      expect(event).toMatch(/"error": ".+ - JavaScript heap out of memory"/)
      expect(event).toContain(
        `"nextVersion": "${require('next/package.json').version}"`
      )
      expect(event).toContain(`"nodeVersion": "${process.versions.node}"`)
      expect(event).toMatch(/"childProcessDuration": [0-9]+/)
      expect(event).toContain(`"hasBabelConfig": false`)
      expect(event).toContain(`"hasWebpackConfig": false`)
      expect(event).toContain(`"compiledSuccessfully": false`)
    })

    test('with babel, custom webpack and successful compilation', async () => {
      // Babel config
      await next.patchFile(
        '.babelrc',
        `{
          "presets": ["next/babel"],
          "plugins": []
        }`
      )
      // Webpack config
      await next.patchFile(
        'next.config.js',
        `module.exports = {
            webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
              return config
            },
          }`
      )

      // Let it compile successfully
      delete process.env.__NEXT_DEV_NODE_ARGS
      process.env.NEXT_TELEMETRY_DEBUG = '1'
      await next.start()

      renderViaHTTP(next.appPort, '/fake-fatal-error').catch(() => {})

      await check(() => next.cliOutput, /NEXT_DEV_CRASH_REPORT/)

      const event = /NEXT_DEV_CRASH_REPORT[\s\S]+?{([\s\S]+?)}/
        .exec(next.cliOutput)
        .pop()
      expect(event).toMatch(/"error": "This is a fatal error"/)
      expect(event).toContain(
        `"nextVersion": "${require('next/package.json').version}"`
      )
      expect(event).toContain(`"nodeVersion": "${process.versions.node}"`)
      expect(event).toMatch(/"childProcessDuration": [0-9]+/)
      expect(event).toContain(`"hasBabelConfig": true`)
      expect(event).toContain(`"hasWebpackConfig": true`)
      expect(event).toContain(`"compiledSuccessfully": true`)
    })
  })
})
