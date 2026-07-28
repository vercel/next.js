import { nextTestSetup } from 'e2e-utils'

const HTML_LIMITED_BOT_UA = 'Twitterbot'

describe('PPR resume bot metadata', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    // This test directly emulates the platform's internal resume request using
    // locally generated postponed state and private runtime switches.
    skipDeployment: true,
    env: {
      NEXT_PRIVATE_TEST_HEADERS: '1',
      NEXT_PRIVATE_MINIMAL_MODE: '1',
    },
  })

  it('preserves the prerender metadata tree for an HTML-limited bot', async () => {
    const { postponed } = await next.readJSON('.next/server/app/dynamic.meta')
    expect(postponed).toEqual(expect.any(String))
    expect(postponed.length).toBeGreaterThan(0)

    const outputIndex = next.cliOutput.length
    const response = await next.fetch('/dynamic', {
      method: 'POST',
      headers: {
        'next-resume': '1',
        'x-matched-path': '/dynamic',
        'user-agent': HTML_LIMITED_BOT_UA,
      },
      body: postponed,
    })

    expect(response.status).toBe(200)

    const html = await response.text()
    expect(html).toContain('dynamic content')
    expect(html).toContain('dynamic-metadata-title')
    expect(
      next.cliOutput.slice(outputIndex).match(/Expected the resume to render/)
    ).toBeNull()
  })

  it('preserves the prerender metadata tree for an RSC prefetch', async () => {
    const { postponed } = await next.readJSON('.next/server/app/dynamic.meta')
    expect(postponed).toEqual(expect.any(String))
    expect(postponed.length).toBeGreaterThan(0)

    const outputIndex = next.cliOutput.length
    const response = await next.fetch('/dynamic', {
      method: 'POST',
      headers: {
        'next-resume': '1',
        'next-router-prefetch': '2',
        rsc: '1',
        'x-matched-path': '/dynamic',
        'user-agent': HTML_LIMITED_BOT_UA,
      },
      body: postponed,
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/x-component')
    expect(await response.text()).toContain('dynamic content')
    expect(
      next.cliOutput.slice(outputIndex).match(/Expected the resume to render/)
    ).toBeNull()
  })

  it('preserves the prerender metadata tree during not-found recovery', async () => {
    const { postponed } = await next.readJSON('.next/server/app/error.meta')
    expect(postponed).toEqual(expect.any(String))
    expect(postponed.length).toBeGreaterThan(0)

    const outputIndex = next.cliOutput.length
    const response = await next.fetch('/error', {
      method: 'POST',
      headers: {
        'next-resume': '1',
        'x-matched-path': '/error',
        'user-agent': HTML_LIMITED_BOT_UA,
      },
      body: postponed,
    })

    expect(response.status).toBe(200)
    expect(await response.text()).toContain('error-metadata-title')
    expect(
      next.cliOutput.slice(outputIndex).match(/Expected the resume to render/)
    ).toBeNull()
  })
})
