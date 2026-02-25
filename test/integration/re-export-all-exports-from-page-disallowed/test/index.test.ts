/* eslint-env jest */
import { File, nextBuild } from 'next-test-utils'
import { join } from 'path'

const appDir = join(__dirname, '..')

describe('Re-export all exports from page is disallowed', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      it('shows error when a page re-export all exports', async () => {
        const { code, stderr } = await nextBuild(appDir, undefined, {
          stderr: true,
          cwd: appDir,
        })
        expect(code).toBe(1)
        expect(stderr).toInclude('pages/contact.js')
        expect(stderr).toInclude('3:1')
        expect(stderr).toInclude(
          "Using `export * from '...'` in a page is disallowed. Please use `export { default } from '...'` instead."
        )
        expect(stderr).toInclude(
          'Read more: https://nextjs.org/docs/messages/export-all-in-page'
        )
      })

      it('builds without error when no `export * from "..."` is used in pages', async () => {
        const f = new File(join(appDir, 'pages', 'contact.js'))
        f.replace(/^export \*/gm, '// export *')
        try {
          const { code, stderr } = await nextBuild(appDir, undefined, {
            stderr: true,
            cwd: appDir,
          })
          expect(code).toBe(0)
          expect(stderr).not.toMatch(/\/export-all-in-page/)
        } finally {
          f.restore()
        }
      })
    }
  )
})
