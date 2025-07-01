import { nextTestSetup, isNextDev } from 'e2e-utils'

describe('upward-distdir', () => {
  const { next } = nextTestSetup({
    skipDeployment: true,
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
