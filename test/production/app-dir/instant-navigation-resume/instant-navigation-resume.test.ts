import { nextTestSetup } from 'e2e-utils'

describe('instant-navigation-resume', () => {
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

  async function getPostponedState() {
    const { postponed } = await next.readJSON('.next/server/app/index.meta')

    expect(postponed).toEqual(expect.any(String))
    expect(postponed.length).toBeGreaterThan(0)
    return postponed as string
  }

  it('handles an instant-navigation document resume', async () => {
    const postponed = await getPostponedState()
    const cliOutputIndex = next.cliOutput.length
    const response = await next.fetch('/', {
      method: 'POST',
      headers: {
        cookie: 'next-instant-navigation-testing=1',
        'next-resume': '1',
        'x-matched-path': '/',
      },
      body: postponed,
    })

    expect(response.status).toBe(200)
    await response.text()
    expect(
      next.cliOutput
        .slice(cliOutputIndex)
        .match(/Invariant app-page handler received invalid cache entry PAGES/)
    ).toBeNull()
  })

  it('handles an instant-navigation RSC prefetch resume', async () => {
    const postponed = await getPostponedState()
    const cliOutputIndex = next.cliOutput.length
    const response = await next.fetch('/', {
      method: 'POST',
      headers: {
        cookie: 'next-instant-navigation-testing=1',
        'next-resume': '1',
        'next-router-prefetch': '1',
        rsc: '1',
        'x-matched-path': '/',
      },
      body: postponed,
    })

    expect(response.status).toBe(200)
    await response.text()
    expect(
      next.cliOutput
        .slice(cliOutputIndex)
        .match(/Invariant app-page handler received invalid cache entry PAGES/)
    ).toBeNull()
  })
})
