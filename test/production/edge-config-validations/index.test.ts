import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'

describe('Edge config validations', () => {
  let next: NextInstance

  afterAll(() => next.destroy())

  it('fails to build when allowDynamic is not a string', async () => {
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

          eval('toto')

          export const config = { allowDynamic: true }
        `,
      },
    })
    await expect(next.start()).rejects.toThrow('next build failed')
    expect(next.cliOutput).toMatch(
      `exported 'config.allowDynamic' must be a string or an array of strings`
    )
  })
})
