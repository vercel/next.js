import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import fs from 'fs/promises'
import path from 'path'

/**
 * `node_modules` is a symlink whose target is outside of the project root, e.g. a git worktree
 * that shares the `node_modules` of the primary checkout.
 *
 * Turbopack does not follow symlinks that leave the filesystem root, so `next/package.json` cannot
 * be resolved. The dev server must:
 *   - surface a recoverable issue that names the cause
 *   - NOT crash with a `TurbopackInternalError` / "FATAL" log
 */
const describeMaybe =
  process.env.NEXT_SKIP_ISOLATE ||
  !process.env.IS_TURBOPACK_TEST ||
  // Creating symlinks requires elevated privileges on Windows.
  process.platform === 'win32'
    ? describe.skip
    : describe

describeMaybe('node-modules-symlink-outside-root', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  let outsideDir: string

  beforeAll(async () => {
    // Move the installed `node_modules` next to the project and link to it from the project.
    const nodeModules = path.join(next.testDir, 'node_modules')
    outsideDir = `${next.testDir}-outside`
    await fs.mkdir(outsideDir)
    await fs.rename(nodeModules, path.join(outsideDir, 'node_modules'))
    await fs.symlink(path.join(outsideDir, 'node_modules'), nodeModules)

    await next.start()
  })

  afterAll(async () => {
    await fs.rm(outsideDir, { recursive: true, force: true })
  })

  it('surfaces a friendly issue instead of crashing', async () => {
    await retry(
      async () => {
        expect(next.cliOutput).toContain(
          'Could not find the Next.js package (next/package.json)'
        )
      },
      10000,
      500
    )
    expect(next.cliOutput).toContain(
      'Symlink node_modules could not be resolved: the symlink target leaves the filesystem root'
    )

    expect(next.cliOutput).not.toContain(
      'FATAL: An unexpected Turbopack error occurred'
    )
    expect(next.cliOutput).not.toContain('TurbopackInternalError')

    // The dev server is still running.
    const res = await next.fetch('/')
    expect(res.status).toBe(500)
  })
})
