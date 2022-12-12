import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import webdriver from 'next-webdriver'
import { waitFor } from 'next-test-utils'

describe('redirects and rewrites in middleware', () => {
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

  it('should rewrite correctly', async () => {
    const browser = await webdriver(next.url, '/')
    browser.elementById('link-middleware-rewrite').click()
    await waitFor(200)

    expect(await browser.elementById('page').text()).toBe(
      'middleware-rewrite-after'
    )
    const url = new URL(await browser.url())
    expect(url.pathname).toEndWith('-before')
  })
})
