/* eslint-env jest */

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
  'structuredClone',
  'queueMicrotask',
  // no need to test all of the process methods
  'process.cwd',
  'process.getuid',
]
const unsupportedClasses = [
  'BroadcastChannel',
  'ByteLengthQueuingStrategy',
  'CompressionStream',
  'CountQueuingStrategy',
  'CryptoKey',
  'DecompressionStream',
  'DomException',
  'Event',
  'EventTarget',
  'MessageChannel',
  'MessageEvent',
  'MessagePort',
  'ReadableByteStreamController',
  'ReadableStreamBYOBReader',
  'ReadableStreamBYOBRequest',
  'ReadableStreamDefaultController',
  'ReadableStreamDefaultReader',
  'SubtleCrypto',
  'TextDecoderStream',
  'TextEncoderStream',
  'TransformStreamDefaultController',
  'WritableStreamDefaultController',
  'WritableStreamDefaultWriter',
]

describe('Middleware using Node.js API', () => {
  const appDir = join(__dirname, '..')

  describe('dev mode', () => {
    let output = ''
    let appPort: number
    let app = null

    beforeAll(async () => {
      output = ''
      appPort = await findPort()
      app = await launchApp(appDir, appPort, {
        onStdout(msg) {
          output += msg
        },
        onStderr(msg) {
          output += msg
        },
      })
    })

    afterAll(() => killApp(app))

    it.each([
      ...unsupportedFunctions.map((api) => ({
        api,
        error: `${api} is not a function`,
      })),
      ...unsupportedClasses.map((api) => ({
        api,
        error: `${api} is not a constructor`,
      })),
    ])(`shows error when using $api`, async ({ api, error }) => {
      const res = await fetchViaHTTP(appPort, `/${api}`)
      await waitFor(500)
      expect(res.status).toBe(500)
      expect(output)
        .toContain(`NodejsRuntimeApiInMiddlewareWarning: You're using a Node.js API (${api}) which is not supported in the Edge Runtime that Middleware uses.
Learn more: https://nextjs.org/docs/api-reference/edge-runtime`)
      expect(output).toContain(`TypeError: ${error}`)
    })
  })

  describe('production mode', () => {
    let buildResult

    beforeAll(async () => {
      buildResult = await nextBuild(appDir, undefined, {
        stderr: true,
        stdout: true,
      })
    })

    it.each(
      [...unsupportedFunctions, ...unsupportedClasses].map((api, index) => ({
        api,
        line: 5 + index * 3,
      }))
    )(`warns for $api during build`, ({ api, line }) => {
      expect(buildResult.stderr)
        .toContain(`You're using a Node.js API (${api} at line: ${line}) which is not supported in the Edge Runtime that Middleware uses. 
Learn more: https://nextjs.org/docs/api-reference/edge-runtime`)
    })
  })
})
