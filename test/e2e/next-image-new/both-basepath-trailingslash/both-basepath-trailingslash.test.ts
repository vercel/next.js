import { nextTestSetup } from 'e2e-utils'

describe('Image Component basePath + trailingSlash Tests', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should correctly load image src from import', async () => {
    const browser = await next.browser('/prefix/')
    const img = await browser.elementById('import-img')
    const src = await img.getAttribute('src')
    expect(normalizeURL(src)).toBe(
      `/prefix/_next/image/?url=%2Fprefix%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.jpg&w=828&q=75`
    )
    const res = await next.fetch(src)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
  })

  it('should correctly load image src from string', async () => {
    const browser = await next.browser('/prefix/')
    const img = await browser.elementById('string-img')
    const src = await img.getAttribute('src')
    expect(src).toBe(`/prefix/_next/image/?url=%2Fprefix%2Ftest.jpg&w=640&q=75`)
    const res = await next.fetch(src)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
  })
})

function normalizeURL(text: string) {
  return text
    .replace(/test\.[0-9a-z_-]{4,}\.(png|jpe?g)/g, 'test.HASH.$1')
    .replace(/_next%2Fstatic%2Fimmutable%2F/g, '_next%2Fstatic%2F')
}
