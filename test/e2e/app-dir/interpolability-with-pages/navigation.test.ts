import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import webdriver from 'next-webdriver'
import { waitFor } from 'next-test-utils'

describe('navigation between pages and app dir', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(__dirname),
      dependencies: {
        react: 'latest',
        'react-dom': 'latest',
        typescript: 'latest',
        '@types/react': 'latest',
        '@types/node': 'latest',
      },
    })
  })
  afterAll(() => next.destroy())

  it('It should be able to navigate app -> pages', async () => {
    const browser = await webdriver(next.url, '/app')
    expect(await browser.elementById('app-page').text()).toBe('App Page')
    browser.elementById('link-to-pages').click()
    await waitFor(100)
    expect(await browser.hasElementByCssSelector('#app-page')).toBeFalse()
    expect(await browser.elementById('pages-page').text()).toBe('Pages Page')
  })
})
