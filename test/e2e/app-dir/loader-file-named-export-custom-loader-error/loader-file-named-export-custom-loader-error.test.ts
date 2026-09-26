import { nextTestSetup } from 'e2e-utils'
import { waitForRedbox, getRedboxHeader } from 'next-test-utils'

const errorMessage =
  'images.loaderFile detected but the file is missing default export.\nRead more: https://nextjs.org/docs/messages/invalid-images-config'

async function testDev(browser, errorRegex) {
  await waitForRedbox(browser)
  expect(await getRedboxHeader(browser)).toMatch(errorRegex)
}

describe('Error test if the loader file export a named function', () => {
  describe('in Development', () => {
    const { next, isNextDev } = nextTestSetup({
      files: __dirname,
    })

    ;(isNextDev ? describe : describe.skip)('development only', () => {
      it('should show the error when using `Image` component', async () => {
        const browser = await next.browser('/')
        await testDev(browser, errorMessage)
      })

      it('should show the error when using `getImageProps` method', async () => {
        const browser = await next.browser('/get-img-props')
        await testDev(browser, errorMessage)
      })
    })
  })

  // @force-gate !dev
  describe('in Build and Start', () => {
    const { next } = nextTestSetup({
      skipStart: true,
      files: __dirname,
    })

    it('should show the build error', async () => {
      await expect(next.start()).rejects.toThrow()
      expect(next.cliOutput).toContain(errorMessage)
    }, 240_000)
  })
})
