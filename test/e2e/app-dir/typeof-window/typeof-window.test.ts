import { nextTestSetup } from 'e2e-utils'
import path from 'path'

describe('typeof-window', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      'my-differentiated-files': `file:${path.join(__dirname, 'my-differentiated-files.tar')}`,
    },
  })

  it('should work using cheerio', async () => {
    const $ = await next.render$('/')
    expect($('h1').text()).toBe('Page loaded')
  })
})
