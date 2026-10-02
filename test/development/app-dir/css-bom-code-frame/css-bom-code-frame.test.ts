import { readFileSync } from 'fs'
import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import stripAnsi from 'strip-ansi'

// A leading BOM is stripped before the CSS is handed to the parser, so parser
// positions are relative to the stripped copy while the code frame is rendered
// from the original (un-stripped) file. Only errors on the first line are
// affected, because the BOM contains no newline.
//
// Turbopack-only: this asserts on positions reported by Turbopack's CSS parser.
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'css BOM code frame',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    it('keeps the fixtures byte-exact', () => {
      // The whole point of the fixtures is the leading bytes, and an editor or
      // formatter dropping them would silently turn the test below into a pass.
      const bom = readFileSync(join(__dirname, 'app', 'bom', 'error.css'))
      expect([bom[0], bom[1], bom[2]]).toEqual([0xef, 0xbb, 0xbf])

      const noBom = readFileSync(join(__dirname, 'app', 'no-bom', 'error.css'))
      expect(noBom[0]).not.toBe(0xef)
    })

    it('reports the right column for an error on the first line', async () => {
      // A warning for one file can be re-emitted while the other is compiled,
      // so each column is matched against its own path rather than whatever
      // happens to appear first in the output.
      const columnFor = async (dir: string) => {
        // Anchored on `app/` so that the `bom` pattern does not also match
        // inside `no-bom/error.css`.
        const pattern = new RegExp(`app/${dir}/error\\.css:1:(\\d+)\\b`)

        await next.fetch(`/${dir}`)

        let column: number | undefined
        await retry(async () => {
          const match = stripAnsi(next.cliOutput).match(pattern)
          expect(match).not.toBeNull()
          column = Number(match[1])
        })

        return column
      }

      // Both files hold the same invalid `@media (min-width: {})` on line 1 and
      // differ only by the leading BOM. The BOM occupies one character position
      // in the line the code frame renders, so the reported column for the BOM
      // file must be exactly one greater. Without that correction both report
      // the same column and the BOM file's caret is rendered one column early.
      const withoutBom = await columnFor('no-bom')
      const withBom = await columnFor('bom')

      expect(withBom).toBe(withoutBom + 1)
    })
  }
)
