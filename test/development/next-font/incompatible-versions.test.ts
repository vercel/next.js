import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { join } from 'path'
import webdriver from 'next-webdriver'
import { getRedboxSource, hasRedbox } from 'next-test-utils'

describe('incompatible-versions', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(join(__dirname, 'incompatible-versions/pages')),
      },
      // Make sure @next/font 13.0.0 is installed from npm - not the version from the monorepo
      installCommand: 'pnpm add @next/font@13.0.0',
    })
  })
  afterAll(() => next.destroy())

  it('should warn that you might be using incompatible versions of next and @next/font on unknown error', async () => {
    const browser = await webdriver(next.url, '/')
    expect(await hasRedbox(browser, true)).toBeTrue()

    const errorMessage = await getRedboxSource(browser)

    // @next/font error info
    expect(errorMessage).toInclude('pages/index.js')
    expect(errorMessage).toInclude('An error occured in `@next/font`.')
    expect(errorMessage).toInclude(
      'You might be using incompatible version of `@next/font` (13.0.0) and `next`'
    )
    // Error
    expect(errorMessage).toInclude(
      'TypeError: Cannot read properties of undefined'
    )
    // Stacktrace
    expect(errorMessage).toInclude('at fetchFonts')
  })
})
