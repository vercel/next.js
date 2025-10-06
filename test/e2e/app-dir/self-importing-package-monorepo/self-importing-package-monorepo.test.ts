import { nextTestSetup } from 'e2e-utils'

describe('self-importing-package-monorepo', () => {
  const dependencies = (global as any).isNextDeploy
    ? // `link` is incompatible with the npm version used when this test is deployed
      {
        'internal-pkg': 'file:./internal-pkg',
      }
    : {
        'internal-pkg': 'link:./internal-pkg',
      }
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies,
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
