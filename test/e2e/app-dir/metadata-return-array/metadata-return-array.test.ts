import { nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'

describe('metadata-return-array', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    // we skip start & deploy because the build will fail and we won't be able to catch it
    // start is re-triggered but caught in the assertions below.
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should throw if metadata returns an Array object', async () => {
    if (isNextDev) {
      await next.start()
      const html = await next.render('/')

      expect(html).toContain(
        'The return type of metadata must be a non-Array object'
      )
    } else {
      await expect(next.start()).rejects.toThrow('next build failed')

      await check(
        () => next.cliOutput,
        /The return type of metadata must be a non-Array object/
      )
    }
  })
  it('should throw if generateMetadata returns an Array object', async () => {
    if (isNextDev) {
      await next.start()
      const html = await next.render('/1')

      expect(html).toContain(
        'The return type of generateMetadata must be a non-Array object'
      )
    }
    // it will throw before reach building /1
  })
})
