import { join } from 'node:path'
import webdriver from 'next-webdriver'
import { createNext, FileRef, type NextInstance } from 'e2e-utils'

// Pattern that does not cause error
describe('invalid HTTP URL slash', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(join(__dirname, 'pages')),
      },
    })
  })

  afterAll(() => {
    next.destroy()
  })

  it('should navigate "//" correctly client-side', async () => {
    const browser = await webdriver(next.url, '/')
    // Change to "//"
    await browser.elementByCss('button').click().waitForIdleNetwork()
    const text = await browser.waitForElementByCss('h1', 100).text()
    expect(text).toBe('index page')
  })
})
