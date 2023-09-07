/* eslint-env jest */

import { remove } from 'fs-extra'
import stripAnsi from 'next/dist/compiled/strip-ansi'
import {
  fetchViaHTTP,
  findPort,
  killApp,
  launchApp,
  nextBuild,
  waitFor,
} from 'next-test-utils'
import { join } from 'path'

jest.setTimeout(1000 * 60 * 2)

const unsupportedFunctions = [
  'setImmediate',
  'clearImmediate',
  // no need to test all of the process methods
  'process.cwd',
  'process.cpuUsage',
  'process.getuid',
]
const undefinedProperties = [
  // no need to test all of the process properties
  'process.arch',
  'process.version',
]
const unsupportedClasses = [
  'BroadcastChannel',
  'ByteLengthQueuingStrategy',
  'CompressionStream',
  'CountQueuingStrategy',
  'DecompressionStream',
  'DomException',
  'MessageChannel',
  'MessageEvent',
  'MessagePort',
  'ReadableByteStreamController',
  'ReadableStreamBYOBRequest',
  'ReadableStreamDefaultController',
  'TransformStreamDefaultController',
  'WritableStreamDefaultController',
]

describe.each([
  {
    title: 'Middleware',
    computeRoute(useCase) {
      return `/${useCase}`
    },
  },
  {
    title: 'Edge route',
    computeRoute(useCase) {
      return `/api/route?case=${useCase}`
    },
  },
])('$title using Node.js API', ({ computeRoute }) => {
  const appDir = join(__dirname, '..')

  describe('dev mode', () => {
    let output = ''
    let appPort: number
    let app = null

    beforeAll(async () => {
      output = ''
      appPort = await findPort()
      app = await launchApp(appDir, appPort, {
        env: { __NEXT_TEST_WITH_DEVTOOL: '1' },
        onStdout(msg) {
          output += msg
        },
        onStderr(msg) {
          output += msg
        },
      })
    })

    afterAll(() => killApp(app))

    it.each(undefinedProperties.map((api) => ({ api })))(
      'does not throw on using $api',
      async ({ api }) => {
        const res = await fetchViaHTTP(appPort, computeRoute(api))
        expect(res.status).toBe(200)
        await waitFor(500)
        expect(output).not.toInclude(`A Node.js API is used (${api})`)
      }
    )

    it.each([
      ...unsupportedFunctions.map((api) => ({
        api,
        errorHighlight: `${api}(`,
      })),
      ...unsupportedClasses.map((api) => ({
        api,
        errorHighlight: `new ${api}(`,
      })),
    ])(`throws error when using $api`, async ({ api, errorHighlight }) => {
      const res = await fetchViaHTTP(appPort, computeRoute(api))
      expect(res.status).toBe(500)
      await waitFor(500)
      expect(output)
        .toInclude(`A Node.js API is used (${api}) which is not supported in the Edge Runtime.
Learn more: https://nextjs.org/docs/api-reference/edge-runtime`)
      expect(stripAnsi(output)).toInclude(errorHighlight)
    })
  })

  describe('production mode', () => {
    let buildResult

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
      buildResult = await nextBuild(appDir, undefined, {
        stderr: true,
        stdout: true,
      })
    })

    it.each(
      [...unsupportedFunctions, ...unsupportedClasses].map((api, index) => ({
        api,
      }))
    )(`warns for $api during build`, ({ api }) => {
      expect(buildResult.stderr).toContain(`A Node.js API is used (${api}`)
    })

    it.each([...undefinedProperties].map((api) => ({ api })))(
      'does not warn on using $api',
      ({ api }) => {
        expect(buildResult.stderr).toContain(`A Node.js API is used (${api}`)
      }
    )
  })
})
