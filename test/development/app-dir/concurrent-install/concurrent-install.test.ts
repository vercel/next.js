import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'

/**
 * Simulates the failure mode where a concurrent package manager install
 * reorganizes `node_modules` while the Next.js dev server is running.
 *
 * Specifically, when `next` (re)moves under `node_modules` mid-HMR, Turbopack
 * fails to resolve `next/package.json` and emits a `MissingNextFolderIssue`.
 * The dev server must:
 *   - surface the issue (recoverable, not Fatal)
 *   - NOT crash with a `TurbopackInternalError` / "FATAL" log
 *   - recover once `node_modules/next` is restored
 */
// This test manipulates the test-dir's `node_modules/next`, which only exists
// when the harness performs the real isolated install. With NEXT_SKIP_ISOLATE
// (the local dev-loop optimization), no install is performed and the dev server
// resolves `next` from the repo's dist/ instead — there's nothing to move.
const describeMaybe = process.env.NEXT_SKIP_ISOLATE ? describe.skip : describe

describeMaybe('concurrent-install', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function getNextPath(): Promise<string> {
    const nextPath = path.join(next.testDir, 'node_modules', 'next')
    // sanity check
    await fs.lstat(nextPath)
    return nextPath
  }

  async function moveNextAside(): Promise<{ original: string; stash: string }> {
    const original = await getNextPath()
    const stash = `${original}.stash-${Date.now()}`
    await fs.rename(original, stash)
    return { original, stash }
  }

  async function restoreNext({
    original,
    stash,
  }: {
    original: string
    stash: string
  }): Promise<void> {
    await fs.rename(stash, original)
  }

  it('does not crash when node_modules/next is moved mid-session', async () => {
    await next.browser('/')

    const getOutput = next.getCliOutputFromHere()
    const stashInfo = await moveNextAside()
    try {
      // Force a recompile while next is missing. Touching the page should
      // trigger Turbopack to re-resolve, which is when the failure surfaces.
      await next.patchFile(
        'app/page.tsx',
        `export default function Page() {
  return <p>hello world (edited)</p>
}
`
      )

      // Give the dev server time to react. We're not asserting on a specific
      // user-visible behavior here — we just want the failure path to fire.
      await retry(
        async () => {
          // The friendly Issue should be surfaced.
          expect(getOutput()).toContain('Could not find the Next.js package')
        },
        5000,
        500
      )
    } finally {
      await restoreNext(stashInfo)
    }

    // The dev server must not have died from a TurbopackInternalError.
    // (Whether the page itself recovers without a manual reload is a separate
    // dev-server caching concern; the catastrophic failure mode is the crash.)
    expect(getOutput()).not.toContain(
      'FATAL: An unexpected Turbopack error occurred'
    )
    expect(getOutput()).not.toContain('TurbopackInternalError')
  })

  it('surfaces a friendly issue when node_modules/next is missing', async () => {
    await next.browser('/')

    const getOutput = next.getCliOutputFromHere()
    const stashInfo = await moveNextAside()
    try {
      await next.patchFile(
        'app/page.tsx',
        `export default function Page() {
  return <p>hello world (while-missing)</p>
}
`
      )

      // Wait for the Issue to be rendered to stdout.
      await retry(
        async () => {
          expect(getOutput()).toContain('Could not find the Next.js package')
        },
        10000,
        500
      )

      // The full issue text. Normalize path-like values that vary per run
      // (the test-dir is a random tmpdir).
      const issueText = extractMissingNextIssue(getOutput(), next.testDir)
      expect(issueText).toMatchInlineSnapshot(`
        "Turbopack build encountered 1 errors:
        ./app
        Could not find the Next.js package (next/package.json)
        Resolved from: <test-dir>/app
        Filesystem root used for resolution: <test-dir>

        Possible causes:
          - node_modules is being reorganized by a concurrent install (e.g. pnpm adding a package with a \`next\` peer dependency). This is transient and should clear once the install completes.
          - node_modules/next was removed, renamed, or has a broken symlink.
          - The workspace root is incorrect — see turbopack.root in the Next.js config docs for how to configure it.
          - In a monorepo, the Next.js package is hoisted to a directory above the workspace root and is not reachable from there.
          - Next.js is installed globally rather than as a project dependency. This is rare and not recommended; install it locally.

        Note: For security and performance reasons, files outside of the workspace root are not compiled.

        https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack#root-directory"
      `)

      expect(getOutput()).not.toContain(
        'FATAL: An unexpected Turbopack error occurred'
      )
      expect(getOutput()).not.toContain('TurbopackInternalError')
    } finally {
      await restoreNext(stashInfo)
    }
  })
})

/**
 * Extract the contiguous block of CLI output containing the
 * `MissingNextFolderIssue`, starting at the `Turbopack build encountered`
 * banner and ending at the documentation link. Replaces the absolute test-dir
 * path with `<test-dir>` so the snapshot is stable across runs.
 *
 * Returns the empty string if the issue banner is not found, so the assertion
 * surfaces a useful failure message rather than failing in extraction.
 */
function extractMissingNextIssue(cliOutput: string, testDir: string): string {
  const start = cliOutput.indexOf('Turbopack build encountered')
  if (start < 0) {
    return ''
  }
  const endMarker =
    'https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack#root-directory'
  const endIdx = cliOutput.indexOf(endMarker, start)
  if (endIdx < 0) {
    return cliOutput.slice(start).trimEnd()
  }
  const block = cliOutput.slice(start, endIdx + endMarker.length)
  // Resolve symlinks because the macOS tmpdir resolves /var/folders → /private/var/folders.
  const realTestDir = fsSync.realpathSync(testDir)
  return block
    .replaceAll(realTestDir, '<test-dir>')
    .replaceAll(testDir, '<test-dir>')
    .trimEnd()
}
