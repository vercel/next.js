import fs from 'fs/promises'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'

// The test directory is a monorepo root with the Next.js app in `web/`. Route
// handlers read dynamic paths relative to the monorepo root and to the project
// directory, which makes those whole directories part of the trace.
describe('output-file-tracing-dangling-symlink', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('skips dangling symlinks when tracing dynamic paths', async () => {
    await fs.symlink(
      'does-not-exist',
      path.join(next.testDir, 'dangling-root-link')
    )
    await fs.symlink(
      'does-not-exist',
      path.join(next.testDir, 'web/data/dangling-link')
    )

    const { exitCode, cliOutput } = await next.runCommand(['build'], {
      cwd: path.join(next.testDir, 'web'),
    })
    expect(cliOutput).not.toContain('could not be resolved')
    expect(exitCode).toBe(0)

    for (const route of ['read-root', 'read-project']) {
      const traceDirectory = path.join(
        next.testDir,
        `web/.next/server/app/api/${route}`
      )
      const trace: { files: string[] } = JSON.parse(
        await next.readFile(
          `web/.next/server/app/api/${route}/route.js.nft.json`
        )
      )
      const toTracePath = (filePath: string) =>
        path.relative(traceDirectory, filePath).replaceAll(path.sep, '/')

      expect(trace.files).toContain(
        toTracePath(path.join(next.testDir, 'web/data/data.txt'))
      )
      expect(trace.files).not.toContain(
        toTracePath(path.join(next.testDir, 'web/data/dangling-link'))
      )
      expect(trace.files).not.toContain(
        toTracePath(path.join(next.testDir, 'dangling-root-link'))
      )
    }
  })
})
