import fs from 'fs/promises'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'

// The test directory is a monorepo root with the Next.js app in `web/`. A route
// handler reads `path.join(process.cwd(), '..', name)`, which makes the whole
// monorepo root part of the trace, while `outputFileTracingExcludes` excludes
// the `target` directory at the monorepo root.
//
// Turbopack-specific: webpack traces with nft and doesn't expand dynamic paths
// over the file system the same way.
// @force-gate turbopack
describe('output-file-tracing-dynamic-cwd', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('does not read files excluded by outputFileTracingExcludes', async () => {
    const targetDir = path.join(next.testDir, 'target/debug/deps')
    await fs.mkdir(targetDir, { recursive: true })
    await fs.writeFile(path.join(targetDir, 'lib.rlib'), 'artifact')
    // A file that can't be read: the build fails if it reads any excluded
    // file. (Running as root, the file stays readable and this can't fail.)
    const unreadable = path.join(targetDir, 'unreadable.rlib')
    await fs.writeFile(unreadable, 'artifact')
    await fs.chmod(unreadable, 0o000)

    const { exitCode, cliOutput } = await next.runCommand(['build'], {
      cwd: path.join(next.testDir, 'web'),
    })
    expect(cliOutput).not.toContain('Permission denied')
    expect(exitCode).toBe(0)

    const traceDirectory = path.join(
      next.testDir,
      'web/.next/server/app/api/read-file'
    )
    const trace: { files: string[] } = JSON.parse(
      await next.readFile(
        'web/.next/server/app/api/read-file/route.js.nft.json'
      )
    )
    const toTracePath = (filePath: string) =>
      path.relative(traceDirectory, filePath).replaceAll(path.sep, '/')

    // The dynamic path traces files from the monorepo root...
    expect(trace.files).toContain(
      toTracePath(path.join(next.testDir, 'web/data/data.txt'))
    )
    expect(trace.files).toContain(
      toTracePath(path.join(next.testDir, 'package.json'))
    )
    // ...but nothing from the excluded directory.
    const targetPrefix = toTracePath(path.join(next.testDir, 'target')) + '/'
    expect(trace.files.filter((f) => f.startsWith(targetPrefix))).toEqual([])
  })
})
