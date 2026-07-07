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
const describeMaybe = process.env.NEXT_SKIP_ISOLATE ? describe.skip : describe

describeMaybe('concurrent-install', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  const itTurbopack = isTurbopack ? it : it.skip

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

  itTurbopack(
    'does not crash when node_modules/next is moved mid-session',
    async () => {
      await next.browser('/')

      const getOutput = next.getCliOutputFromHere()
      const stashInfo = await moveNextAside()
      try {
        // Force a recompile while next is missing. Not strickly necessary, but important to ensure
        // we do recover with the new content eventually
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
    }
  )

  itTurbopack(
    'surfaces a friendly issue when node_modules/next is missing',
    async () => {
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
        expect(getOutput()).toContain(
          'Could not find the Next.js package (next/package.json)'
        )

        expect(getOutput()).not.toContain(
          'FATAL: An unexpected Turbopack error occurred'
        )
        expect(getOutput()).not.toContain('TurbopackInternalError')
      } finally {
        await restoreNext(stashInfo)
      }
    }
  )

  itTurbopack(
    'does not crash when navigating to an uncompiled route while node_modules/next is missing',
    async () => {
      // Compile `/` so the harness has at least one warm chunk.
      await next.browser('/')

      const getOutput = next.getCliOutputFromHere()
      const stashInfo = await moveNextAside()
      try {
        // Navigating to `/late-route` (never compiled in this session) forces
        // a fresh `hmr_version_state` evaluation for that chunk. That path
        // hits `get_next_package`, which Errs when `node_modules/next` is
        // missing. The dev server must surface the failure as an Issue and
        // keep the HMR subscription alive — not crash.
        await next.fetch('/late-route').catch(() => {
          // The request itself may fail (500) while next is missing. That's
          // expected. We only care that the dev server stays alive.
        })

        await retry(
          async () => {
            expect(getOutput()).toContain('Could not find the Next.js package')
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

      // Once next is restored, `/late-route` should eventually render.
      await retry(
        async () => {
          const res = await next.fetch('/late-route')
          expect(res.status).toBe(200)
          expect(await res.text()).toContain('late route')
        },
        15000,
        500
      )
    }
  )
})
