import { nextTestSetup } from 'e2e-utils'

describe('empty shell redirect resume', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should build an empty shell with postponed state', async () => {
    expect(await next.readFile('.next/server/app/login.html')).toBe('')

    const metadata = JSON.parse(
      await next.readFile('.next/server/app/login.meta')
    )
    expect(metadata.postponed).toBeTruthy()
  })

  it('should resume an empty shell with a redirect', async () => {
    const response = await fetch(`${next.url}/login`, {
      headers: {
        cookie: 'session=valid',
      },
      signal: AbortSignal.timeout(3000),
    })
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(html).toContain('id="__next_error__"')
    expect(html).toContain('NEXT_REDIRECT;replace;/search;307;')
  })
})
