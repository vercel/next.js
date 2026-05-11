import { nextTestSetup } from 'e2e-utils'
import {
  getRedboxDescription,
  getRedboxSource,
  waitForRedbox,
} from 'next-test-utils'

describe('Invalid Image Import (dev)', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  it('should show error', async () => {
    const browser = await next.browser('/')
    await waitForRedbox(browser)
    const description = await getRedboxDescription(browser)
    if (isTurbopack) {
      expect(description).toContain('Processing image failed')
    } else if (process.env.NEXT_RSPACK) {
      expect(description).toContain(
        'Image import "../public/invalid.svg" is not a valid image file. The image may be corrupted or an unsupported format.'
      )
    } else {
      expect(description).toContain(
        'Image import "../public/invalid.svg" is not a valid image file. The image may be corrupted or an unsupported format.'
      )
    }
    const source = await getRedboxSource(browser)
    if (isTurbopack) {
      expect(source).toContain('Processing image failed')
      expect(source).toContain(
        'Failed to parse svg source code for image dimensions'
      )
      expect(source).toContain(
        'Source code does not contain a <svg> root element'
      )
    } else if (process.env.NEXT_RSPACK) {
      expect(source).toContain('./pages/index.js')
      expect(source).toContain(
        'Image import "../public/invalid.svg" is not a valid image file. The image may be corrupted or an unsupported format.'
      )
    } else {
      expect(source).toContain('./pages/index.js')
      expect(source).toContain(
        'Image import "../public/invalid.svg" is not a valid image file. The image may be corrupted or an unsupported format.'
      )
    }
  })
})
