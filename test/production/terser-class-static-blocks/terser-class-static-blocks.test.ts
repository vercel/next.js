import { nextTestSetup } from 'e2e-utils'

describe('terser-class-static-blocks', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    nextConfig: {
      swcMinify: false,
    },
  })

  it('should work using cheerio', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('hello world')
  })
})
