import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { getRedboxSource, hasRedbox } from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

describe('font-loader-in-document-error', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(join(__dirname, 'font-loader-in-document/pages')),
      },
    })
  })
  afterAll(() => next.destroy())

  test('next/font inside _document', async () => {
    const browser = await webdriver(next.url, '/')
    expect(await hasRedbox(browser)).toBeTrue()
    expect(await getRedboxSource(browser)).toMatchInlineSnapshot(`
      "pages/_document.js
      \`next/font\` error:
      Cannot be used within pages/_document.js."
    `)
  })
})
