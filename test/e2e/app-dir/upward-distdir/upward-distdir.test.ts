import { nextTestSetup, isNextDev } from 'e2e-utils'

// This fixture writes its build output above the project root.
// Deployment setup expects project build artifacts and cannot find this fixture's BUILD_ID.
// @force-gate !deploy
describe('upward-distdir', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    installCommand: 'pnpm install',
    buildCommand: 'pnpm next build apps/next-nx-test',
    startCommand: isNextDev
      ? 'pnpm next dev apps/next-nx-test'
      : 'pnpm next start apps/next-nx-test',
  })

  it('should work', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('hello world')
  })
})
