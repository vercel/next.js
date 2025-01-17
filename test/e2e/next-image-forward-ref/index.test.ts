import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
import { waitFor } from 'next-test-utils'
import path from 'path'
import webdriver from 'next-webdriver'

describe('next-image-forward-ref', () => {
  let next: NextInstance

  const appDir = path.join(__dirname, 'app')

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(appDir),
      dependencies: {
        'framer-motion': '7.6.9',
      },
    })
  })
  afterAll(() => next.destroy())

  it('allows framer-motion to animate opacity', async () => {
    const browser = await webdriver(next.url, '/framer-motion')
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
