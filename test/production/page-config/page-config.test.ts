import { nextTestSetup } from 'e2e-utils'

describe('Page Config', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('builds without error when export const config is used outside page', async () => {
    const { cliOutput } = await next.build()
    expect(cliOutput).not.toMatch(/Failed to compile\./)
  })

  it('shows valid error when page config is a string', async () => {
    const origContent = await next.readFile('pages/invalid/string-config.js')
    const newContent = origContent.replace('// export', 'export')
    await next.patchFile('pages/invalid/string-config.js', newContent)

    try {
      const { cliOutput } = await next.build()

      // The two bundlers reject this config in different places, so each one
      // reports a different error.
      if (isTurbopack) {
        // Turbopack rejects the config in its own transform, and the build
        // stops there. It never reads the value with the segment config schema.
        expect(cliOutput).toContain(
          "Next.js can't recognize the exported `config` field"
        )
      } else {
        // Webpack reads the value with the segment config schema, and the
        // schema rejects the string. The build stops with that error.
        //
        // `getPageStaticInfo` also warns that it cannot recognize the field.
        // Only the server compilation logs that warning, and the build can stop
        // before the server compilation reaches this page. The warning
        // therefore does not always reach the output, and this test does not
        // assert it. The tests below do, because the build does not stop for
        // the configs they use.
        expect(cliOutput).toContain(
          'Invalid segment configuration options detected for "/invalid/string-config"'
        )
        expect(cliOutput).toContain(
          'Expected object, received string at "config"'
        )
      }
    } finally {
      await next.patchFile('pages/invalid/string-config.js', origContent)
    }
  })

  it('shows valid error when page config has no init', async () => {
    const origContent = await next.readFile('pages/invalid/no-init.js')
    const newContent = origContent.replace('// export', 'export')
    await next.patchFile('pages/invalid/no-init.js', newContent)

    try {
      const { cliOutput } = await next.build()
      expect(cliOutput).toContain(
        "Next.js can't recognize the exported `config`"
      )
    } finally {
      await next.patchFile('pages/invalid/no-init.js', origContent)
    }
  })

  it('shows error when page config has spread properties', async () => {
    const origContent = await next.readFile('pages/invalid/spread-config.js')
    const newContent = origContent.replace('// export', 'export')
    await next.patchFile('pages/invalid/spread-config.js', newContent)

    try {
      const { cliOutput } = await next.build()
      expect(cliOutput).toContain(
        "Next.js can't recognize the exported `config`"
      )
    } finally {
      await next.patchFile('pages/invalid/spread-config.js', origContent)
    }
  })

  it('shows error when page config is export from', async () => {
    const origContent = await next.readFile('pages/invalid/export-from.js')
    const newContent = origContent.replace('// export', 'export')
    await next.patchFile('pages/invalid/export-from.js', newContent)

    try {
      const { cliOutput } = await next.build()
      expect(cliOutput).toContain(
        "Next.js can't recognize the exported `config`"
      )
    } finally {
      await next.patchFile('pages/invalid/export-from.js', origContent)
    }
  })

  it('shows error when page config is imported and exported', async () => {
    const origContent = await next.readFile('pages/invalid/import-export.js')
    const newContent = origContent.replace('// export', 'export')
    await next.patchFile('pages/invalid/import-export.js', newContent)

    try {
      const { cliOutput } = await next.build()
      expect(cliOutput).toContain(
        "Next.js can't recognize the exported `config`"
      )
    } finally {
      await next.patchFile('pages/invalid/import-export.js', origContent)
    }
  })
})
