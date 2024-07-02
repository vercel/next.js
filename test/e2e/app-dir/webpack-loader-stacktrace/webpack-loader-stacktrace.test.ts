import { nextTestSetup } from 'e2e-utils'
import cheerio from 'cheerio'
describe('webpack-loader-stacktrace', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: {
      NODE_OPTIONS: '--enable-source-maps',
    },
  })

  it('app route stack trace should use original file path', async () => {
    const filePath = 'app-route-source.txt'
    const res = await next.fetch('/route')
    const content = await res.text()
    expect(content).toContain(filePath)
  })

  it('pages stack trace should use original file path', async () => {
    const filePath = 'pages-source.txt'
    const res = await next.fetch('/')
    const html = await res.text()
    const $ = cheerio.load(html)
    const content = $('main').html()
    expect(content).toContain(filePath)
  })
  it('app page stack trace should use original file path', async () => {
    const filePath = 'app-page-source.txt'
    const res = await next.fetch('/app')
    const html = await res.text()
    const $ = cheerio.load(html)
    const content = $('main').html()
    expect(content).toContain(filePath)
  })
})
