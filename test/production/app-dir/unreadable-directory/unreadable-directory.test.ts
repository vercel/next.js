import fs from 'node:fs/promises'
import path from 'node:path'
import { nextTestSetup } from 'e2e-utils'

// Removing the permissions of a directory has no effect on Windows.
// @force-gate !windows
describe('unreadable-directory', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('should build when the project contains a directory that cannot be read', async () => {
    // The route in app/api/join makes the build look for `out` in every
    // directory of the project, including this one.
    const unreadableDir = path.join(next.testDir, 'unreadable')
    await fs.mkdir(unreadableDir)
    await fs.chmod(unreadableDir, 0o000)
    let exitCode: NodeJS.Signals | number | null = null
    try {
      // Root can read the directory anyway, which would make this test pass
      // without covering anything.
      await expect(fs.readdir(unreadableDir)).rejects.toMatchObject({
        code: 'EACCES',
      })
      exitCode = (await next.build()).exitCode
    } finally {
      await fs.chmod(unreadableDir, 0o755)
    }
    expect(exitCode).toBe(0)

    await next.start({ skipBuild: true })
    const res = await next.fetch('/api/join?dir=/tmp')
    expect(await res.json()).toEqual({ out: '/tmp/out' })
  })
})
