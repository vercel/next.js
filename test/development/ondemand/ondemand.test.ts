import { nextTestSetup, isTurbopack } from 'e2e-utils'
import { retry } from 'next-test-utils'
;(isTurbopack ? describe.skip : describe)('On Demand Entries', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    startCommand: 'node server.js',
    serverReadyPattern: /- Local:/,
    dependencies: {
      'get-port': '5.1.1',
    },
  })

  it('should compile pages for SSR', async () => {
    const pageContent = await next.render('/')
    expect(pageContent).toContain('Index Page')
  })

  it('should compile pages for JSON page requests', async () => {
    await next.render('/about')
    const manifest = JSON.parse(
      await next.readFile('.next/dev/build-manifest.json')
    )
    const pageFiles = manifest.pages['/about']
    expect(pageFiles).toBeDefined()
    const pageFile = pageFiles[pageFiles.length - 1]
    expect(pageFile).toMatch(/\.js$/)
    expect(pageFile).toContain('pages/about')
    const pageContent = await next.render(`/_next/${pageFile}`)
    expect(pageContent).toContain('About Page')
  })

  it('should dispose inactive pages', async () => {
    await next.render('/')
    await next.render('/about')
    await next.render('/third')

    await retry(
      async () => {
        const manifest = JSON.parse(
          await next.readFile('.next/dev/build-manifest.json')
        )
        expect(manifest.pages['/']).toBeUndefined()
        expect(manifest.pages['/about']).toBeDefined()
        expect(manifest.pages['/third']).toBeDefined()
      },
      30_000,
      1000
    )
  })

  it('should navigate to pages with dynamic imports', async () => {
    const browser = await next.browser('/nav')
    await browser.eval('document.getElementById("to-dynamic").click()')
    await retry(async () => {
      const text = await browser.elementByCss('body').text()
      expect(text).toMatch(/Hello/)
    })
  })
})
