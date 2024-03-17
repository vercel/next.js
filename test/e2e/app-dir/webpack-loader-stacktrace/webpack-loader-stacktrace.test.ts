import { nextTestSetup } from 'e2e-utils'
import cheerio from 'cheerio'
describe('webpack-loader-stacktrace', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  if (!isTurbopack) {
    it('should only run the test in turbopack', () => {})
    return
  }
  it('app route stack trace should use original file path', async () => {
    const filePath = 'app/route/route.tsx'
    const res = await next.fetch('/route')
    const content = await res.text()
    expect(content).toContain(filePath)
  })

  it('pages stack trace should use original file path', async () => {
    const filePath = 'pages/index.tsx'
    const res = await next.fetch('/')
    const html = await res.text()
    const $ = cheerio.load(html)
    const content = $('main').html()
    expect(content).toContain(filePath)
  })
  it('app page stack trace should use original file path', async () => {
    const filePath = 'app/app/page.tsx'
    const res = await next.fetch('/app')
    const html = await res.text()
    const $ = cheerio.load(html)
    const content = $('main').html()
    expect(content).toContain(filePath)
  })
})
