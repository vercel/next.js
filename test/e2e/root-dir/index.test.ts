import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { renderViaHTTP } from 'next-test-utils'
import path from 'path'
import cheerio from 'cheerio'

describe('root dir', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        public: new FileRef(path.join(__dirname, 'app/public')),
        pages: new FileRef(path.join(__dirname, 'app/pages')),
        root: new FileRef(path.join(__dirname, 'app/root')),
        'next.config.js': new FileRef(
          path.join(__dirname, 'app/next.config.js')
        ),
      },
      dependencies: {
        react: '18.0.0-rc.2',
        'react-dom': '18.0.0-rc.2',
      },
    })
  })
  afterAll(() => next.destroy())

  it('should serve from pages', async () => {
    const html = await renderViaHTTP(next.url, '/')
    expect(html).toContain('hello from pages/index')
  })

  it('should serve dynamic route from pages', async () => {
    const html = await renderViaHTTP(next.url, '/blog/first')
    expect(html).toContain('hello from pages/blog/[slug]')
  })

  it('should serve from public', async () => {
    const html = await renderViaHTTP(next.url, '/hello.txt')
    expect(html).toContain('hello world')
  })

  it('should serve from root', async () => {
    const html = await renderViaHTTP(next.url, '/dashboard')
    expect(html).toContain('hello from root/dashboard')
  })

  it('should include parent route', async () => {
    const html = await renderViaHTTP(next.url, '/dashboard')
    const $ = cheerio.load(html)
    expect($('h1').text()).toBe('Dashboard')
  })
})
