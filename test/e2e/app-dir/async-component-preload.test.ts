import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import webdriver from 'next-webdriver'
import path from 'path'

describe('async-component-preload', () => {
  if ((global as any).isNextDeploy) {
    it('should skip next deploy for now', () => {})
    return
  }

  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(path.join(__dirname, 'async-component-preload')),
      dependencies: {
        react: 'latest',
        'react-dom': 'latest',
      },
    })
  })
  afterAll(() => next.destroy())

  it('should handle redirect in an async page', async () => {
    const browser = await webdriver(next.url, '/')
    expect(await browser.waitForElementByCss('#success').text()).toBe('Success')
  })
})
