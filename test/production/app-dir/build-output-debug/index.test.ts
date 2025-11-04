import { nextTestSetup } from 'e2e-utils'
import stripAnsi from 'strip-ansi'

describe('next build --debug', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    buildCommand: 'pnpm next build --debug',
  })

  let output = ''
  beforeAll(() => {
    output = stripAnsi(next.cliOutput)
  })

  it('should log Redirects above Route(app)', async () => {
    let data = output
      .slice(output.indexOf('Redirects\n'), output.indexOf('○  (Static)'))
      .trim()

    expect(data).toMatchInlineSnapshot(`
     "Redirects
     ┌ source: /:path+/
     ├ destination: /:path+
     └ permanent: true

     ┌ source: /redirects
     ├ destination: /
     └ permanent: true


     Headers
     ┌ source: /
     └ headers:
       └ x-custom-headers: headers


     Rewrites
     ┌ source: /rewrites
     └ destination: /


     Route (app)
     ┌ ○ /
     └ ○ /_not-found"
    `)
  })
})
