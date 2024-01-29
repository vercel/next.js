import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'

// This test is basically for https://github.com/vercel/next.js/discussions/51910
// to make sure that some libs that we know are using `eval` but don't break
// because it will never run into that condition, but still can't to be DCE'd.

describe('Edge safe dynamic code', () => {
  let next: NextInstance

  afterAll(() => next.destroy())

  it('should not fail when "function-bind" package is used', async () => {
    next = await createNext({
      skipStart: true,
      dependencies: {
        'function-bind': 'latest',
      },
      files: {
        'pages/index.js': `
          export default function Page() { 
            return <p>hello world</p>
          } 
        `,
        'middleware.js': `
          import { NextResponse } from 'next/server'
          import * as bind from 'function-bind'
          console.log(bind)
          export default async function middleware(request) {
            return NextResponse.next()
          }
        `,
      },
    })
    await next.start()

    expect(next.cliOutput).not.toContain(
      `Dynamic Code Evaluation (e. g. 'eval', 'new Function', 'WebAssembly.compile') not allowed in Edge Runtime`
    )
  })
})
