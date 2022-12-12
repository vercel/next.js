import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import webdriver from 'next-webdriver'
import { waitFor } from 'next-test-utils'

describe('app-dir navigation and querystring', () => {
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

  it('shoul set query correctly', async () => {
    const browser = await webdriver(next.url, '/')
    expect(await browser.elementById('query').text()).toMatchInlineSnapshot(
      `"{}"`
    )

    browser.elementById('set-query').click()
    await waitFor(200)

    expect(await browser.elementById('query').text()).toMatchInlineSnapshot()
  })
})
