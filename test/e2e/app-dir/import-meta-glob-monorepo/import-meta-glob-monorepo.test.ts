import { nextTestSetup, FileRef } from 'e2e-utils'
import * as path from 'path'

// `import.meta.glob` is a Turbopack-only feature, and webpack compiles
// `import.meta` to `{}`, so the page would throw while collecting page data.
// This suite lives in its own monorepo rather than in
// `test/e2e/app-dir/non-root-project-monorepo`, so that skipping it here doesn't
// take that suite's webpack coverage with it.
const testFn =
  process.env.IS_WEBPACK_TEST || process.env.NEXT_RSPACK
    ? describe.skip
    : describe

testFn('import-meta-glob-monorepo', () => {
  const { next, skipped } = nextTestSetup({
    files: {
      apps: new FileRef(path.resolve(__dirname, 'apps')),
      // Deliberately shadows apps/web/content, to pin down which one a
      // `/`-rooted pattern resolves from.
      content: new FileRef(path.resolve(__dirname, 'content')),
      'pnpm-workspace.yaml': `packages:
      - 'apps/*'
      `,
    },
    packageJson: require('./package.json'),
    buildCommand: 'pnpm build',
    startCommand: (global as any).isNextDev ? 'pnpm dev' : 'pnpm start',
    installCommand: 'pnpm i',
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should resolve a `/`-rooted pattern from the project directory, like a plain import', async () => {
    const $ = await next.render$('/glob')
    // The point of the test: a glob and a plain import agree about what `/` means.
    expect($('#glob-value').text()).toBe($('#import').text())
    expect($('#glob-value').text()).toBe('FROM-PROJECT-DIR')
    // The key stays absolute from the project directory, as in Vite.
    expect(JSON.parse($('#glob-keys').text())).toEqual(['/content/where.ts'])
  })
})
