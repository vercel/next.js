import path from 'path'
import { createRequire } from 'module'
import { nextTestSetup } from 'e2e-utils'
import type { NextAdapter } from 'next'

describe('adapter output - styled-jsx', () => {
  const { next } = nextTestSetup({
    files: path.join(__dirname, 'fixture'),
    skipStart: true,
    dependencies: {
      // A version that does not dedupe with the one Next.js depends on, so the
      // app gets its own copy of styled-jsx next to Next.js' copy. That is the
      // case where the require hook in next/dist/server/require-hook is
      // load-bearing: without it user code and the Pages Router renderer end up
      // with two styled-jsx instances and every style is silently dropped from
      // the server-rendered HTML.
      'styled-jsx': '5.1.7',
    },
  })

  it('should include the styled-jsx files the require hook resolves', async () => {
    await next.build()

    // Turbopack traces these via `Project::additional_traced_modules`, webpack via
    // `getSharedNodeAssets` in build-complete.ts - either way they have to end up in the
    // function's assets, otherwise the require hook can't dedupe styled-jsx at runtime.
    const { outputs, repoRoot }: Parameters<NextAdapter['onBuildComplete']>[0] =
      await next.readJSON('build-complete.json')

    const declaredAssets = new Set<string>()
    for (const output of outputs.pages) {
      for (const asset of Object.keys(output.assets)) {
        declaredAssets.add(asset)
      }
    }
    expect(declaredAssets.size).toBeGreaterThan(0)

    // Ask the require hook of the Next.js version that built the app which files
    // it maps `styled-jsx` to - those are the ones the deployment has to contain.
    // Note that requiring it installs the hook in this process, which is what
    // Next.js itself does at runtime as well.
    const appRequire = createRequire(path.join(next.testDir, 'noop.js'))
    const { requireHookEntries } = appRequire(
      'next/dist/server/require-hook'
    ) as typeof import('next/dist/server/require-hook')

    const requiredFiles = requireHookEntries().map((file) =>
      path.relative(repoRoot, file)
    )
    expect(requiredFiles.length).toBeGreaterThan(0)

    for (const requiredFile of requiredFiles) {
      expect(Array.from(declaredAssets)).toContain(requiredFile)
    }
  })
})
