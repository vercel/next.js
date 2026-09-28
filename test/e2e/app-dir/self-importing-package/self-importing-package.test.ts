import { nextTestSetup } from 'e2e-utils'

describe('self-importing-package', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      'internal-pkg': 'file:./internal-pkg.tar',
    },
  })

  it('should resolve self-imports in an external package', async () => {
    const $ = await next.render$('/')
    expect($('h1').text()).toBe('test abc')
  })
})
