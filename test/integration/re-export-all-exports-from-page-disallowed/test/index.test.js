/* eslint-env jest */
import { File, nextBuild } from 'next-test-utils'
import { join } from 'path'

const appDir = join(__dirname, '..')

describe('Re-export all exports from page is disallowed', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    it('shows error when a page re-export all exports', async () => {
      const { code, stderr } = await nextBuild(appDir, undefined, {
        stderr: true,
      })
      expect(code).toBe(1)
      expect(stderr).toMatch(/\/export-all-in-page/)

      expect(stderr.split('\n\n')[1]).toMatchInlineSnapshot(`
      "./pages/contact.js:3:1
      Syntax error: Using \`export * from '...'\` in a page is disallowed. Please use \`export { default } from '...'\` instead.
      Read more: https://nextjs.org/docs/messages/export-all-in-page"
    `)
    })

    it('builds without error when no `export * from "..."` is used in pages', async () => {
      const f = new File(join(appDir, 'pages', 'contact.js'))
      f.replace(/^export \*/gm, '// export *')
      try {
        const { code, stderr } = await nextBuild(appDir, undefined, {
          stderr: true,
        })
        expect(code).toBe(0)
        expect(stderr).not.toMatch(/\/export-all-in-page/)
      } finally {
        f.restore()
      }
    })
  })
})
