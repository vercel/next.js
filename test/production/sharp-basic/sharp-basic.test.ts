import { nextTestSetup } from 'e2e-utils'

describe('sharp support with hasNextSupport', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      sharp: 'latest',
    },
    env: {
      NOW_BUILDER: '1',
    },
  })

  // we're mainly checking if build/start were successful so
  // we have a basic assertion here
  it('should work using cheerio', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('hello world')
  })
})
