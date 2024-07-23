import { nextTestSetup } from 'e2e-utils'

describe('self-importing-package-monorepo', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      'internal-pkg': 'link:./internal-pkg',
    },
    packageJson: {
      name: 'next-app',
      exports: {
        '.': {
          default: './index.js',
        },
      },
    },
  })

  it('should resolve self-imports inside a monorepo', async () => {
    const $ = await next.render$('/')
    expect($('h1').text()).toBe('Hello world test abc index')
  })
})
