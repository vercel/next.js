import { nextTestSetup } from 'e2e-utils'

describe('Re-export all exports from page is disallowed', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    dependencies: {
      'find-up': '4.1.0',
    },
  })

  it('shows error when a page re-export all exports', async () => {
    const { cliOutput, exitCode } = await next.build()
    expect(exitCode).toBe(1)
    expect(cliOutput).toContain('pages/contact.js')
    expect(cliOutput).toContain('3:1')
    expect(cliOutput).toContain(
      "Using `export * from '...'` in a page is disallowed. Please use `export { default } from '...'` instead."
    )
    expect(cliOutput).toContain(
      'Read more: https://nextjs.org/docs/messages/export-all-in-page'
    )
  })

  it('builds without error when no `export * from "..."` is used in pages', async () => {
    const origContent = await next.readFile('pages/contact.js')
    const newContent = origContent.replace(/^export \*/gm, '// export *')
    await next.patchFile('pages/contact.js', newContent)

    try {
      const { cliOutput, exitCode } = await next.build()
      expect(exitCode).toBe(0)
      expect(cliOutput).not.toMatch(/\/export-all-in-page/)
    } finally {
      await next.patchFile('pages/contact.js', origContent)
    }
  })
})
