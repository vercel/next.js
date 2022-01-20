import { join } from 'path'
import webdriver from 'next-webdriver'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { BrowserInterface } from 'test/lib/browsers/base'

describe('emitDecoratorMetadata SWC option', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'jsconfig.json': new FileRef(
          join(__dirname, 'emit-decorator-metadata/jsconfig.json')
        ),
        pages: new FileRef(join(__dirname, 'emit-decorator-metadata/pages')),
      },
    })
  })

  afterAll(() => next.destroy())

  it('should compile with emitDecoratorMetadata enabled', async () => {
    let browser: BrowserInterface
    try {
      browser = await webdriver(next.appPort, '/')
      const message = await browser.elementByCss('#message').text()

      expect(message).toBe('Hello, world!')
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })
})
