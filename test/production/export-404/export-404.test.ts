import { nextTestSetup } from 'e2e-utils'

describe('Static 404 Export', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  // Issue #36855
  // https://github.com/vercel/next.js/issues/36855
  it('only export 404.html when trailingSlash: false', async () => {
    await next.build()

    expect(await next.hasFile('out/404.html')).toBe(true)
    expect(await next.hasFile('out/404.html.html')).toBe(false)
    expect(await next.hasFile('out/404/index.html')).toBe(false)
  })

  it('export 404.html and 404/index.html when trailingSlash: true', async () => {
    await next.patchFile(
      'next.config.js',
      `module.exports = (phase) => {
  return {
    output: 'export',
    trailingSlash: true,
  }
}`
    )
    await next.build()
    await next.patchFile(
      'next.config.js',
      `module.exports = (phase) => {
  return {
    output: 'export',
    trailingSlash: false,
  }
}`
    )

    expect(await next.hasFile('out/404/index.html')).toBe(true)
    expect(await next.hasFile('out/404.html.html')).toBe(false)
    expect(await next.hasFile('out/404.html')).toBe(true)
  })
})

describe('Export with a page named 404.js', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('should export a custom 404.html instead of default 404.html', async () => {
    await next.build()

    const html = await next.readFile('out/404.html')
    expect(html).toMatch(/this is a 404 page override the default 404\.html/)
  })
})
