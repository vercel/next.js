import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('Image Component Trailing Slash Tests', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should include trailing slash when trailingSlash is set on config file', async () => {
    const browser = await next.browser('/')
    const id = 'test1'

    // Use retry for both dev and production modes since the legacy Image component
    // needs time to load and replace the initial placeholder data URL with the optimized image URL
    await retry(async () => {
      const srcImage = await browser.eval(
        `document.getElementById('${id}').src`
      )
      expect(srcImage).toMatch(
        /\/_next\/image\/\?url=%2F_next%2Fstatic%2F(immutable%2F)?media%2Ftest(.+).jpg&w=828&q=75/
      )
    })
  })
})
