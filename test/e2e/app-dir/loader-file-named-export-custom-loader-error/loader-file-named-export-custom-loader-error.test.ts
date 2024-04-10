import { nextTestSetup } from 'e2e-utils'
import { getRedboxHeader, hasRedbox } from 'next-test-utils'

const errorMessage =
  'The loader file must export a default function that returns a string.\nSee more info here: https://nextjs.org/docs/messages/invalid-images-config'

async function testDev(browser, errorRegex) {
  expect(await hasRedbox(browser)).toBe(true)
  expect(await getRedboxHeader(browser)).toMatch(errorRegex)
}

describe('Error test if the loader file export a named function', () => {
  const { next, isNextDev } = nextTestSetup({
    skipDeployment: true,
    skipStart: true,
    files: __dirname,
  })

  if (isNextDev) {
    it('should show the error when using `Image` component', async () => {
      const browser = await next.browser('/')
      await testDev(browser, errorMessage)
    })

    it('should show the error when using `getImageProps` method', async () => {
      const browser = await next.browser('/get-img-props')
      await testDev(browser, errorMessage)
    })
  } else {
    it('should show the build error', async () => {
      await expect(next.start()).rejects.toThrow(
        'next build failed with code/signal 1'
      )
      expect(next.cliOutput).toContain(errorMessage)
    })
  }
})
