import { nextTestSetup } from 'e2e-utils'

describe('import-internal-typescript-esm-package-monorepo', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      'internal-pkg': 'link:./internal-pkg',
    },
  })

  it('should resolve imports from an internal typescript esm package inside a monorepo', async () => {
    const $ = await next.render$('/')
    expect($('h1').text()).toBe('Hello world')
  })
})
