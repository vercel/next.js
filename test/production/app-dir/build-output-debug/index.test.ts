import { nextTestSetup } from 'e2e-utils'
import stripAnsi from 'strip-ansi'

describe('next build --debug', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    buildCommand: 'pnpm next build --debug',
  })

  it('should log Redirects above Route(app)', async () => {
    const output = stripAnsi(next.cliOutput)

    const redirectsIndex = output.indexOf(`Redirects
┌ source: /:path+/
├ destination: /:path+
└ permanent: true`)

    const routeAppIndex = output.indexOf(`Route (app)
┌ ○ /
└ ○ /_not-found`)

    expect(redirectsIndex).toBeGreaterThan(-1)
    expect(routeAppIndex).toBeGreaterThan(-1)

    expect(redirectsIndex).toBeLessThan(routeAppIndex)
  })
})
