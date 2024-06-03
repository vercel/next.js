import { nextTestSetup } from 'e2e-utils'

describe('self-importing-package-monorepo', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    buildCommand: 'pnpm run build',
    startCommand: 'pnpm run start',
    devCommand: 'pnpm run dev',
    packageJson: {
      scripts: {
        build:
          'pnpm install && pnpm --filter=internal-pkg run build && pnpm --filter=next-app run build',
        dev: 'pnpm install && pnpm --filter=internal-pkg run build && pnpm --filter=next-app run dev',
        start: 'pnpm --filter=next-app run start',
      },
    },
  })

  it('should work using cheerio', async () => {
    const $ = await next.render$('/')
    expect($('h1').text()).toBe('Hello world test abc')
  })
})
