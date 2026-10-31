import { nextTestSetup, isNextDev } from 'e2e-utils'

// `exportPathMap` + `useFileSystemPublicRoutes: false` is a dev-only routing
// behavior; the custom server runs `next({ dev: true })` so production mode is
// not exercised by the original integration test.
;(isNextDev ? describe : describe.skip)('FileSystemPublicRoutes', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    startCommand: 'node server.js',
    serverReadyPattern: /- Local:/,
    dependencies: {
      'get-port': '5.1.1',
    },
  })

  it('should not route to the index page', async () => {
    const res = await next.fetch('/')
    expect(res.status).toBe(404)
    const body = await res.text()
    expect(body).toMatch(/404/)
  })

  it('should route to exportPathMap defined routes in development', async () => {
    const res = await next.fetch('/exportpathmap-route')
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toMatch(/exportpathmap was here/)
  })

  it('should serve JavaScript files correctly', async () => {
    const browser = await next.browser('/exportpathmap-route')
    const text = await browser.waitForElementByCss('#page-was-loaded').text()
    expect(text).toBe('Hello World')
  })

  it('should route to public folder files', async () => {
    const res = await next.fetch('/hello.txt')
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toMatch(/hello/)
  })
})
