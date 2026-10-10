import { nextTestSetup } from 'e2e-utils'

describe('typeof-window', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      'my-differentiated-files': 'file:./my-differentiated-files.tar',
    },
  })

  it('should work using cheerio', async () => {
    const $ = await next.render$('/')
    expect($('h1').text()).toBe('Page loaded')
  })
})
