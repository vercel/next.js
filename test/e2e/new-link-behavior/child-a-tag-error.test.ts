import { createNext, FileRef, hasRedbox } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import webdriver from 'next-webdriver'
import path from 'path'

const appDir = path.join(__dirname, 'stitches')

describe('New Link Behavior with <a> child', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(path.join(appDir, 'pages')),
        'next.config.js': new FileRef(path.join(appDir, 'next.config.js')),
      },
      dependencies: {
        next: 'latest',
        react: 'latest',
        'react-dom': 'latest',
      },
    })
  })
  afterAll(() => next.destroy())

  it('should throw error with <a> child', async () => {
    const browser = await webdriver(next.url, `/`)
    expect(await hasRedbox(browser, true)).toBe(true)
  })
})
