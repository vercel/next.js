import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import fs from 'fs/promises'
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

      // The Issue rendered to stdout should mention the package name and
      // the recovery hint about a concurrent install.
      await retry(
        async () => {
          expect(getOutput()).toContain('Could not find the Next.js package')
          expect(getOutput()).toContain(
            'node_modules is being reorganized by a concurrent install'
          )
        },
        10000,
        500
      )

      expect(getOutput()).not.toContain(
        'FATAL: An unexpected Turbopack error occurred'
      )
      expect(getOutput()).not.toContain('TurbopackInternalError')
    } finally {
      await restoreNext(stashInfo)
    }
  })
})
