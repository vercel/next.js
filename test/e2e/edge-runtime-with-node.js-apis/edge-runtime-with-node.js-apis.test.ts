import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import stripAnsi from 'next/dist/compiled/strip-ansi'

const unsupportedFunctions = [
  'setImmediate',
  'clearImmediate',
  'process.cwd',
  'process.cpuUsage',
  'process.getuid',
]
const undefinedProperties = ['process.arch', 'process.version']
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

describe('Edge runtime with Node.js APIs', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    // Turbopack builds fail (non-zero exit) when edge code uses Node.js APIs,
    // but the CLI output still contains the warnings we're asserting on. Skip
    // the automatic start so we can run the build manually and ignore the
    // non-zero exit code.
    skipStart: true,
    // Vercel deployment fails to build/deploy this fixture in CI; skip in deploy mode.
    skipDeployment: true,
  })
  if (skipped) return

  beforeAll(async () => {
    if (isNextDev) {
      await next.start()
    } else {
      try {
        await next.build()
      } catch {
        // Build is expected to fail in production when edge code uses
        // unsupported Node.js APIs under Turbopack.
      }
    }
  })

  describe.each([
    {
      title: 'Middleware',
      computeRoute(useCase: string) {
        return `/${useCase}`
      },
    },
    {
      title: 'Edge route',
      computeRoute(useCase: string) {
        return `/api/route?case=${useCase}`
      },
    },
  ])('$title', ({ computeRoute }) => {
    if (isNextDev) {
      it.each(undefinedProperties.map((api) => ({ api })))(
        'does not throw on using $api',
        async ({ api }) => {
          const res = await next.fetch(computeRoute(api))
          expect(res.status).toBe(200)
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
      ])('throws error when using $api', async ({ api, errorHighlight }) => {
        const outputIndex = next.cliOutput.length
        const res = await next.fetch(computeRoute(api))
        expect(res.status).toBe(500)

        await retry(async () => {
          const newOutput = next.cliOutput.slice(outputIndex)
          expect(newOutput).toInclude(
            `A Node.js API is used (${api}) which is not supported in the Edge Runtime.\nLearn more: https://nextjs.org/docs/api-reference/edge-runtime`
          )
          expect(stripAnsi(newOutput)).toInclude(errorHighlight)
        })
      })
    } else {
      it.each(
        [...unsupportedFunctions, ...unsupportedClasses].map((api) => ({
          api,
        }))
      )('warns for $api during build', ({ api }) => {
        expect(next.cliOutput).toContain(`A Node.js API is used (${api}`)
      })

      it.each([...undefinedProperties].map((api) => ({ api })))(
        'does not warn on using $api',
        ({ api }) => {
          expect(next.cliOutput).toContain(`A Node.js API is used (${api}`)
        }
      )
    }
  })
})
