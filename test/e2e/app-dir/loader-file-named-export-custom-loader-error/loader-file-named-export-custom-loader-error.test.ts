import { nextTestSetup } from 'e2e-utils'
import { getRedboxHeader, hasRedbox, nextBuild } from 'next-test-utils'

const errorMessage =
  'The loader file must export a default function that returns a string.\nSee more info here: https://nextjs.org/docs/messages/invalid-images-config'

async function testDev(browser, errorRegex) {
  expect(await hasRedbox(browser)).toBe(true)
  expect(await getRedboxHeader(browser)).toMatch(errorRegex)
}

describe('loader-file-named-export-custom-loader-error', () => {
  describe('development mode', () => {
    const { next } = nextTestSetup({
      skipDeployment: true,
      files: __dirname,
    })

    it('should show an error saying that only default export is allowed when using `Image` component', async () => {
      const browser = await next.browser('/')
      await testDev(browser, errorMessage)
    })

    it('should show an error saying that only default export is allowed when using `getImageProps` method', async () => {
      const browser = await next.browser('/get-img-props')
      await testDev(browser, errorMessage)
    })
  })

  describe('build time - prerendering', () => {
    let stderr: string
    beforeAll(async () => {
      const output = await nextBuild(__dirname, [], {
        stderr: true,
      })
      stderr = output.stderr
    })

    it('should show an error saying that only default export is allowed', async () => {
      expect(stderr).toContain(errorMessage)
    })
  })
})
