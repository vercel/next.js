import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { join } from 'path'
import webdriver from 'next-webdriver'
import { getRedboxSource, hasRedbox } from 'next-test-utils'

describe('build-errors', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(join(__dirname, 'build-errors')),
    })
  })
  afterAll(() => next.destroy())

  // TODO: The error overlay is not closed when restoring the working code.
  ;(process.env.TURBOPACK ? describe : describe.skip)(
    'Skipped in webpack',
    () => {
      it('should show a next/font error when input is wrong', async () => {
        const browser = await webdriver(next.url, '/')
        const content = await next.readFile('app/page.js')

        await next.patchFile(
          'app/page.js',
          `
import localFont from 'next/font/local'

const font = localFont()

export default function Page() {
  return <p className={font.className}>Hello world!</p>
}
`
        )

        expect(await hasRedbox(browser)).toBeTrue()
        expect(await getRedboxSource(browser)).toMatchInlineSnapshot(`
      "app/page.js
      \`next/font\` error:
      Missing required \`src\` property"
    `)

        await next.patchFile('app/page.js', content)
        expect(await hasRedbox(browser)).toBeFalse()
      })

      it("should show a module not found error if local font file can' be resolved", async () => {
        const browser = await webdriver(next.url, '/')
        const content = await next.readFile('app/page.js')

        await next.patchFile(
          'app/page.js',
          `
import localFont from 'next/font/local'

const font = localFont({ src: './boom.woff2'})

export default function Page() {
  return <p className={font.className}>Hello world!</p>
}
`
        )

        expect(await hasRedbox(browser)).toBeTrue()
        const sourceLines = (await getRedboxSource(browser)).split('\n')

        // Should display the file name correctly
        expect(sourceLines[0]).toEqual('app/page.js')
        // Should be module not found error
        expect(sourceLines[1]).toEqual(
          "Module not found: Can't resolve './boom.woff2'"
        )

        await next.patchFile('app/page.js', content)
        expect(await hasRedbox(browser)).toBeFalse()
      })
    }
  )
})
