import { nextTestSetup } from 'e2e-utils'
import { createSandbox } from 'development-sandbox'

describe('next/server APIs in client components', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('errors at compile time when after() is used in a client module', async () => {
    await using sandbox = await createSandbox(next, undefined, '/invalid-after')
    const { session } = sandbox

    const pageFile = 'app/invalid-after/page.js'
    const content = await next.readFile(pageFile)

    // Uncomment the import to trigger the error
    const uncomment = content
      .replace('// import { after } from', 'import { after } from')
      .replace('// after(() => {})', 'after(() => {})')

    await session.patch(pageFile, uncomment)
    await session.waitForRedbox()

    expect(await session.getRedboxSource()).toMatchInlineSnapshot(`
     "./app/invalid-after/page.js (3:10)
     Ecmascript file had an error
       1 | 'use client'
       2 |
     > 3 | import { after } from 'next/server'
         |          ^^^^^
       4 |
       5 | export default function Page() {
       6 |   after(() => {})

     You're importing a component that needs "after". That only works in a Server Component but one of its parents is marked with "use client", so it's a Client Component.
     Learn more: https://nextjs.org/docs/app/building-your-application/rendering

     Import traces:
       Client Component Browser:
         ./app/invalid-after/page.js [Client Component Browser]
         ./app/invalid-after/page.js [Server Component]

       Client Component SSR:
         ./app/invalid-after/page.js [Client Component SSR]
         ./app/invalid-after/page.js [Server Component]"
    `)
  })

  it('errors at compile time when connection() is used in a client module', async () => {
    await using sandbox = await createSandbox(
      next,
      undefined,
      '/invalid-connection'
    )
    const { session } = sandbox

    const pageFile = 'app/invalid-connection/page.js'
    const content = await next.readFile(pageFile)

    // Uncomment the import to trigger the error
    const uncomment = content
      .replace('// import { connection } from', 'import { connection } from')
      .replace('// connection()', 'connection()')

    await session.patch(pageFile, uncomment)
    await session.waitForRedbox()

    expect(await session.getRedboxSource()).toMatchInlineSnapshot(`
     "./app/invalid-connection/page.js (3:10)
     Ecmascript file had an error
       1 | 'use client'
       2 |
     > 3 | import { connection } from 'next/server'
         |          ^^^^^^^^^^
       4 |
       5 | export default function Page() {
       6 |   connection()

     You're importing a component that needs "connection". That only works in a Server Component but one of its parents is marked with "use client", so it's a Client Component.
     Learn more: https://nextjs.org/docs/app/building-your-application/rendering

     Import traces:
       Client Component Browser:
         ./app/invalid-connection/page.js [Client Component Browser]
         ./app/invalid-connection/page.js [Server Component]

       Client Component SSR:
         ./app/invalid-connection/page.js [Client Component SSR]
         ./app/invalid-connection/page.js [Server Component]"
    `)
  })
})
