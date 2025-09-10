import { nextTestSetup } from 'e2e-utils'
import { assertHasRedbox, getRedboxHeader } from 'next-test-utils'

const errorMessage =
  'images.loaderFile detected but the file is missing default export.\nRead more: https://nextjs.org/docs/messages/invalid-images-config'

async function testDev(browser, errorRegex) {
  await assertHasRedbox(browser)
  expect(await getRedboxHeader(browser)).toMatch(errorRegex)
}

describe('Error test if the loader file export a named function', () => {
  describe('in Development', () => {
    const { next, isNextDev } = nextTestSetup({
      skipDeployment: true,
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

  describe('in Build and Start', () => {
    const { next, isNextStart } = nextTestSetup({
      skipDeployment: true,
      skipStart: true,
      files: __dirname,
    })

    ;(isNextStart ? describe : describe.skip)('build and start only', () => {
      it('should show the build error', async () => {
        await expect(next.start()).rejects.toThrow(
          'next build failed with code/signal 1'
        )
        expect(next.cliOutput).toContain(errorMessage)
      })
    })
  })
})
