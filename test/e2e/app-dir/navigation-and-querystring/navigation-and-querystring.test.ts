import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import webdriver from 'next-webdriver'
import { check, waitFor } from 'next-test-utils'

describe('app-dir navigation and querystring', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(__dirname),
    })
  })
  afterAll(() => next.destroy())

  it('should set query correctly', async () => {
    const browser = await webdriver(next.url, '/')
    expect(await browser.elementById('query').text()).toMatchInlineSnapshot(
      `""`
    )

    browser.elementById('set-query').click()

    await check(
      async () => await browser.elementById('query').text(),
      'a=b&c=d'
    )

    const url = new URL(await browser.url())
    expect(url.searchParams.toString()).toMatchInlineSnapshot(`"a=b&c=d"`)
  })
})
