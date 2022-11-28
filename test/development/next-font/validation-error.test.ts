import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { join } from 'path'
import webdriver from 'next-webdriver'
import { getRedboxSource, hasRedbox } from 'next-test-utils'

describe('validation-error', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(join(__dirname, 'validation-error/pages')),
      },
      dependencies: {
        '@next/font': 'canary',
      },
    })
  })
  afterAll(() => next.destroy())

  it('show a @next/font error when input is wrong', async () => {
    const browser = await webdriver(next.url, '/')
    expect(await hasRedbox(browser, true)).toBeTrue()
    expect(await getRedboxSource(browser)).toMatchInlineSnapshot(`
      "pages/index.js
      \`@next/font\` error:
      Missing required \`src\` property"
    `)
  })
})
