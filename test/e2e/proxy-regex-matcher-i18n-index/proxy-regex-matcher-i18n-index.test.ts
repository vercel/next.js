import { nextTestSetup } from 'e2e-utils'

describe('proxy-regex-matcher-i18n-index', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it.each(['/', '/ja/', '/en/', '/about/', '/en/about/'])(
    'should render %s with a non-empty body',
    async (path) => {
      const res = await next.fetch(path)
      expect(res.status).toBe(200)
      const text = await res.text()
      expect(text.length).toBeGreaterThan(0)
    }
  )

  it('should render the home heading on /', async () => {
    const html = await next.render('/')
    expect(html).toContain('home')
  })

  it('should render the about heading on /about/', async () => {
    const html = await next.render('/about/')
    expect(html).toContain('about')
  })
})
