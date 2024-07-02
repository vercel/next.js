import { nextTestSetup } from 'e2e-utils'
import path from 'path'

describe('self-importing-package', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      'my-package': `file:${path.join(__dirname, 'my-package.tar')}`,
      '@repo/internal-pkg': `file:${path.join(__dirname, 'internal-pkg.tar')}`,
    },
  })

  it('should work using cheerio', async () => {
    const $ = await next.render$('/')
    expect($('h1').text()).toBe('THIS IS THE OTHER FILE')
  })
})
