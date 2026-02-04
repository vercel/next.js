import { join } from 'path'
import webdriver, { Playwright } from 'next-webdriver'
import { createNext } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
import { fetchViaHTTP } from 'next-test-utils'

describe('emitDecoratorMetadata SWC option', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: join(__dirname, 'app'),
      dependencies: {
        'reflect-metadata': '0.1.13',
        'path-to-regexp': '6.2.0',
        tsyringe: '4.6.0',
      },
    })
  })

  afterAll(() => next.destroy())

  it('should compile with emitDecoratorMetadata enabled', async () => {
    let browser: Playwright
    try {
      browser = await webdriver(next.url, '/')
      const message = await browser.elementByCss('#message').text()

      expect(message).toBe('Hello, world!')
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  it('should compile with emitDecoratorMetadata enabled for API', async () => {
    const res = await fetchViaHTTP(next.url, '/api/something')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ message: 'Hello, world!' })
  })
})
