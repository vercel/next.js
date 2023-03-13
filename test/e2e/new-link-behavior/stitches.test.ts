import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import webdriver from 'next-webdriver'
import path from 'path'

const appDir = path.join(__dirname, 'stitches')

describe('New Link Behavior with stitches', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(path.join(appDir, 'pages')),
        components: new FileRef(path.join(appDir, 'components')),
        'next.config.js': new FileRef(path.join(appDir, 'next.config.js')),
        'stitches.config.js': new FileRef(
          path.join(appDir, 'stitches.config.js')
        ),
      },
      dependencies: {
        '@stitches/react': '^1.2.6',
        next: 'latest',
        react: 'latest',
        'react-dom': 'latest',
      },
    })
  })
  afterAll(() => next.destroy())

  it('should render <a>', async () => {
    const browser = await webdriver(next.url, `/`)
    const element = await browser.elementByCss('a[href="/about"]')

    const color = await element.getComputedCss('color')
    expect(color).toBe('rgb(78, 39, 231)')

    const text = await element.text()
    expect(text).toBe('Visit About')
  })
})
