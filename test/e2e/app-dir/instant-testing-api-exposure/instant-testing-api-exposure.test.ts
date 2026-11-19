import { FileRef, nextTestSetup } from 'e2e-utils'
import { gate, retry } from 'next-test-utils'
import { join } from 'node:path'

describe('instant-testing-api-exposure', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it.each([
    ['/', 'Prerendered testing API exposure'],
    ['/dynamic', 'Request-time testing API exposure'],
  ])(
    'exposes the testing bootstrap consistently for %s',
    async (path, text) => {
      const html = await next.render(path)
      expect(html).toContain(text)
      expect(html.includes('self.__next_instant_test=fetch')).toBe(
        await gate((conditions) => conditions.cacheComponents)
      )
    }
  )
})

// This suite expects the build to be rejected. In deploy mode, `next.start()`
// is a full Vercel deployment, which exceeds the default test timeout before
// the build failure is observed.
// @force-gate !deploy
describe('instant-testing-api-exposure without Cache Components', () => {
  const { next, isNextDev } = nextTestSetup({
    files: {
      app: new FileRef(join(__dirname, 'app')),
      'next.config.ts': new FileRef(
        join(__dirname, 'fixtures', 'invalid-next.config.ts')
      ),
    },
    skipStart: true,
  })

  it('rejects the production testing opt-in without Cache Components', async () => {
    const message =
      '`experimental.exposeTestingApiInProductionBuild` requires `cacheComponents` to be enabled. Please update your next.config.ts accordingly.'
    if (isNextDev) {
      await next.start()
      await retry(async () => {
        expect(next.cliOutput).toContain(message)
        await expect(next.fetch('/')).rejects.toThrow()
      })
    } else {
      await expect(next.start()).rejects.toThrow()
      expect(next.cliOutput).toContain(message)
    }
  })
})
