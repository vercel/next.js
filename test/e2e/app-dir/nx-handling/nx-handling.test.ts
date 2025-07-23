import { nextTestSetup, isNextDev } from 'e2e-utils'

describe('nx-handling', () => {
  const { next } = nextTestSetup({
    skipDeployment: true,
    files: __dirname,
    installCommand: 'npm i',
    buildCommand: 'npm run build',
    startCommand: isNextDev ? 'npm run dev' : 'npm run start',
    packageJson: {
      name: '@nx-next/source',
      version: '0.0.0',
      private: true,
      scripts: {
        build: 'rm -rf dist; nx run next-nx-test:build',
        dev: 'nx run next-nx-test:dev',
        start: 'nx run next-nx-test:serve:production',
      },
      dependencies: {
        react: '19.0.0',
        'react-dom': '19.0.0',
        '@nx/js': '21.1.3',
        '@nx/next': '21.1.3',
        '@nx/workspace': '21.1.3',
        '@swc-node/register': '~1.9.1',
        '@swc/cli': '~0.6.0',
        '@swc/core': '~1.5.7',
        '@swc/helpers': '~0.5.11',
        '@types/react': '19.0.0',
        '@types/react-dom': '19.0.0',
        nx: '21.1.3',
        tslib: '^2.3.0',
        typescript: '~5.7.2',
      },
      workspaces: ['apps/*'],
    },
  })

  it('should work for pages page', async () => {
    const res = await next.fetch('/pages-test')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Hello world')
  })

  it('should work for pages API', async () => {
    const res = await next.fetch('/api/pages-api')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('Hello, from pages API!')
  })

  it('should work with app page', async () => {
    const res = await next.fetch('/')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Welcome @nx-next/next-nx-test')
  })

  it('should work with app route', async () => {
    const res = await next.fetch('/api/hello')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('Hello, from API!')
  })
})
