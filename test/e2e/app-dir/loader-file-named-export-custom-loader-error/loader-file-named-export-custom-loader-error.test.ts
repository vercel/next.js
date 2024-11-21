import { nextTestSetup } from 'e2e-utils'
import { assertHasRedbox, getRedboxHeader } from 'next-test-utils'

const errorMessage =
  'images.loaderFile detected but the file is missing default export.\nRead more: https://nextjs.org/docs/messages/invalid-images-config'

describe('Error test if the loader file export a named function', () => {
  describe('in Development', () => {
    const { next, isNextDev } = nextTestSetup({
      skipDeployment: true,
      files: __dirname,
    })

    ;(isNextDev ? describe : describe.skip)('development only', () => {
      it('should show the error when using `Image` component', async () => {
        const browser = await next.browser('/')
        await assertHasRedbox(browser, { pageResponseCode: 500 })
        expect(await getRedboxHeader(browser)).toMatch(errorMessage)
      })

      it('should show the error when using `getImageProps` method', async () => {
        const browser = await next.browser('/get-img-props')
        await assertHasRedbox(browser, { pageResponseCode: 500 })
        expect(await getRedboxHeader(browser)).toMatch(errorMessage)
      })
    })
  })

  describe('in Build and Start', () => {
    const { next, isNextStart } = nextTestSetup({
      skipDeployment: true,
      skipStart: true,
      files: __dirname,
    })

    // next build doesn't support turbopack yet
    // see https://nextjs.org/docs/app/api-reference/turbopack#unsupported-features
    ;(isNextStart && !process.env.TURBOPACK ? describe : describe.skip)(
      'build and start only',
      () => {
        it('should show the build error', async () => {
          await expect(next.start()).rejects.toThrow(
            'next build failed with code/signal 1'
          )
          expect(next.cliOutput).toContain(errorMessage)
        })
      }
    )
  })
})
