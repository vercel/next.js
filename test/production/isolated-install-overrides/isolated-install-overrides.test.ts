import fs from 'fs'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'

// `next` depends on `@next/env` at the repo's current version, which the npm
// registry doesn't have until a release finishes propagating. The overrides
// created by `createNextInstall` must win so isolated tests exercise the
// locally built workspace packages regardless of the registry's state.
describe('isolated-install-overrides', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    // Opts out of the shared starter app so this test runs its own install.
    packageJson: { license: 'MIT' },
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('installs workspace packages from local tarballs, not the registry', async () => {
    const lockfile = await next.readFile('pnpm-lock.yaml')
    expect(lockfile).toContain('@next/env@file:')
    expect(lockfile).not.toMatch(/@next\/env@\d/)
  })
})

describe('isolated-install-overrides with a workspace fixture', () => {
  const { next, skipped } = nextTestSetup({
    files: {
      'pages/index.tsx': `
        export default function Page() {
          return <p>hello world</p>
        }
      `,
      // pnpm only honors overrides at the workspace root, so a fixture that
      // creates its own root above the app exercises that the overrides are
      // applied there rather than in the app's own config.
      '../pnpm-workspace.yaml': 'packages:\n  - "test"\n',
      '../package.json': JSON.stringify({
        name: 'workspace-root',
        private: true,
      }),
    },
    subDir: 'test',
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('installs workspace packages from local tarballs, not the registry', async () => {
    const lockfile = fs.readFileSync(
      path.join(next.testDir, '../pnpm-lock.yaml'),
      'utf8'
    )
    expect(lockfile).toContain('@next/env@file:')
    expect(lockfile).not.toMatch(/@next\/env@\d/)
  })
})
