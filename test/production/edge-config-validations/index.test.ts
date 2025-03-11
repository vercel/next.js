import { createNext } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'

describe('Edge config validations', () => {
  let next: NextInstance

  afterAll(() => next.destroy())
  it('fails to build when unstable_allowDynamic is not a string', async () => {
    next = await createNext({
      skipStart: true,
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
    await expect(next.start()).rejects.toThrow('next build failed')
    expect(next.cliOutput).toContain(
      'middleware contains invalid middleware config: Expected string, received boolean at "unstable_allowDynamic", or Expected array, received boolean at "unstable_allowDynamic"'
    )
  })
})
