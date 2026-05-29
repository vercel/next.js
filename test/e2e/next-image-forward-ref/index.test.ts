import { FileRef, nextTestSetup } from 'e2e-utils'
import { waitFor } from 'next-test-utils'
import path from 'path'

describe('next-image-forward-ref', () => {
  const appDir = path.join(__dirname, 'app')

  const { next } = nextTestSetup({
    files: new FileRef(appDir),
    dependencies: {
      'framer-motion': '7.6.9',
    },
  })

  it('allows framer-motion to animate opacity', async () => {
    const browser = await next.browser('/framer-motion')
    expect(
      Number(await browser.elementById('img').getComputedCss('opacity'))
    ).toBeCloseTo(1)
    browser.elementById('img').click()
    await waitFor(1000)
    expect(
      Number(await browser.elementById('img').getComputedCss('opacity'))
    ).toBeCloseTo(0)
  })
})
