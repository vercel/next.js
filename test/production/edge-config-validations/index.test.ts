import { nextTestSetup } from 'e2e-utils'

describe('Edge config validations', () => {
  const { next } = nextTestSetup({
    skipStart: true,
    skipDeployment: true,
    files: {
      'pages/index.js': `
          export default function Page() { 
            return <p>hello world</p>
          } 
        `,
      'middleware.js': `
          import { NextResponse } from 'next/server'
          export default async function middleware(request) {
            return NextResponse.next()
          }

          export const config = { unstable_allowDynamic: true }
        `,
    },
  })

  it('fails to build when unstable_allowDynamic is not a string', async () => {
    const res = await next.build()
    expect(res.exitCode).toBe(1)
    expect(res.cliOutput).toContain(
      'middleware contains invalid middleware config: Expected string, received boolean at "unstable_allowDynamic", or Expected array, received boolean at "unstable_allowDynamic"'
    )
  })
})
