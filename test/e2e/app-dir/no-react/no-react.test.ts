import { nextTestSetup } from 'e2e-utils'

describe('no-react', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    installCommand: 'pnpm remove react react-dom',
  })

  it('should work using cheerio without react, react-dom', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('hello world')
  })
})
