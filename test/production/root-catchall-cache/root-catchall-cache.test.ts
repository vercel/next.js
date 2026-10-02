import { nextTestSetup } from 'e2e-utils'
import { waitFor } from 'next-test-utils'

describe('Root Catch-all Cache', () => {
  // TODO(deploy-test-completion): Re-enable this suite in deploy mode.
  // No deploy-specific incompatibility is documented.
  // @force-gate !deploy
  describe('production mode', () => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    const getRandom = async (path: string) => {
      const $ = await next.render$(path)
      return $('#random').text()
    }

    it('should cache / correctly', async () => {
      const random = await getRandom('/')

      {
        //cached response (revalidate is 2 seconds)
        await waitFor(1000)
        const newRandom = await getRandom('/')
        expect(random).toBe(newRandom)
      }
      {
        //stale response, triggers revalidate
        await waitFor(1000)
        const newRandom = await getRandom('/')
        expect(random).toBe(newRandom)
      }
      {
        //new response
        await waitFor(100)
        const newRandom = await getRandom('/')
        expect(random).not.toBe(newRandom)
      }
    })
  })
})
