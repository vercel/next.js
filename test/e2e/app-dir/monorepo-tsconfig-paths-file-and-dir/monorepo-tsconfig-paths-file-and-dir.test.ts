import { nextTestSetup } from 'e2e-utils'

// Regression test for a Turbopack resolution failure seen with
// `@workflow/core/serialization`: a tsconfig `paths` entry aliases the
// subpath to an extensionless location inside the symlinked (pnpm) package,
// and the package contains both `dist/serialization.js` and
// `dist/serialization/index.js`. Probing `dist/serialization/package.json`
// during folder resolution must be a benign miss, not a fatal symlink error.
describe('monorepo-tsconfig-paths-file-and-dir', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    packageJson: require('./package.json'),
    installCommand: 'pnpm i',
    buildCommand: 'pnpm build',
    startCommand: (global as any).isNextDev ? 'pnpm dev' : 'pnpm start',
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('resolves the paths alias to dist/serialization.js', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('dist/serialization.js')
  })
})
