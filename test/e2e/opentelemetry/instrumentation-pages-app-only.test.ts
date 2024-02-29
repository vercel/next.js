import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

for (const { app, src, pathname, text } of [
  {
    pages: true,
    src: false,
    pathname: '/pages/param/getServerSideProps',
    text: 'Page',
  },
  {
    pages: true,
    src: true,
    pathname: '/pages/param/getServerSideProps',
    text: 'Page',
  },
  {
    app: true,
    src: false,
    pathname: '/app/param/rsc-fetch',
    text: 'Page',
  },
  {
    app: true,
    src: true,
    pathname: '/app/param/rsc-fetch',
    text: 'Page',
  },
]) {
  describe(`instrumentation ${app ? 'app' : 'pages'}${
    src ? ' src/' : ''
  }`, () => {
    const curDir = app ? 'app' : 'pages'
    const oppositeDir = app ? 'pages' : 'app'

    const { next } = nextTestSetup({
      files: __dirname,
      env: {
        NEXT_PUBLIC_SIMPLE_INSTRUMENT: '1',
      },
      skipDeployment: true,
      packageJson: {
        scripts: {
          'setup-dir': `mv instrumentation-minimal.ts instrumentation.ts; rm -rf ${oppositeDir}${
            src
              ? `; mkdir src; mv ${curDir} src/; mv instrumentation.ts src/`
              : ''
          }`,
          dev: 'pnpm setup-dir && next dev',
          build: 'pnpm setup-dir && next build',
          start: 'next start',
        },
      },
      startCommand: `pnpm ${(global as any).isNextDev ? 'dev' : 'start'}`,
      buildCommand: `pnpm build`,
      dependencies: require('./package.json').dependencies,
    })

    it('should start and serve correctly', async () => {
      const html = await next.render(pathname)
      expect(html).toContain(text)
      retry(() => {
        expect(next.cliOutput).toContain('instrumentation log')
      })
    })
  })
}
