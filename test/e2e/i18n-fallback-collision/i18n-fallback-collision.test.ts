import { nextTestSetup } from 'e2e-utils'

describe('i18n-disallow-multiple-locales', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it.each([
    ['/non-existent'],
    ['/es/non-existent'],
    ['/first/non-existent'],
    ['/es/first/non-existent'],
    ['/first/second/non-existent'],
    ['/es/first/second/non-existent'],
  ])(
    'should 404 properly for fallback: false non-prerendered %s',
    async (pathname) => {
      const res = await next.fetch(pathname)
      expect(res.status).toBe(404)
    }
  )

  it.each([
    { urlPath: '/first', page: '/[first]' },
    { urlPath: '/first/second', page: '/[first]/[second]' },
    { urlPath: '/first/second/third', page: '/[first]/[second]/[third]' },
    {
      urlPath: '/first/second/third/fourth',
      page: '/[first]/[second]/[third]/[fourth]',
    },
  ])(
    'should render properly for fallback: false prerendered $urlPath',
    async ({ urlPath, page }) => {
      const res = await next.fetch(urlPath)
      expect(res.status).toBe(200)
      expect(await res.text()).toContain(page)
    }
  )

  it('should render properly for fallback: blocking', async () => {
    const res = await next.fetch('/first/second/third/another')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('/[first]/[second]/[third]/[fourth]')
  })
})
