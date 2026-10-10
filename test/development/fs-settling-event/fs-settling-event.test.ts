import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import stripAnsi from 'strip-ansi'
import fs from 'fs'
import path from 'path'

// The `FilesystemSettlingEvent` compilation event is Turbopack-only.
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'fs-settling-event',
  () => {
    const { next } = nextTestSetup({ files: __dirname })

    it('logs a settling event during sustained node_modules churn', async () => {
      // Compile the page first so the imported `node_modules` file is watched.
      await next.render('/')

      const pkgFile = path.join(
        next.testDir,
        'node_modules/fs-settling-fixture-pkg/index.js'
      )
      const outputIndex = next.cliOutput.length

      // Rewrite the imported module every 20ms. Since 20ms is well below the
      // extended `node_modules` batch delay (200ms), the watcher keeps a single
      // batch of events open, which triggers the settling event after ~5s.
      let i = 0
      const interval = setInterval(() => {
        fs.writeFileSync(pkgFile, `export default ${i++}\n`)
      }, 20)

      try {
        await retry(
          () => {
            const output = stripAnsi(next.cliOutput.slice(outputIndex))
            expect(output).toContain('waiting for the filesystem to settle')
            expect(output).toContain(pkgFile)
          },
          // The event fires after ~5s; allow a generous window to avoid flakes.
          15000,
          500
        )
      } finally {
        clearInterval(interval)
      }
    })
  }
)
