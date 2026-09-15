import { nextTestSetup, isNextDev } from 'e2e-utils'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It likely controls the local Next.js build or server lifecycle.
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
