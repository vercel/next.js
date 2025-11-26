import { nextTestSetup } from 'e2e-utils'

describe('app dir - dynamic error trace', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })
  if (skipped) return

  it('should show the error trace', async () => {
    const browser = await next.browser('/')

    // TODO(veil): Where is the stackframe for app/page.js?
    await expect(browser).toDisplayRedbox(`
     {
       "description": "Route / with \`dynamic = "error"\` couldn't be rendered statically because it used \`headers()\`. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering",
       "environmentLabel": "Server",
       "label": "Runtime Error",
       "source": "app/lib.js (4:13) @ Foo
     > 4 |   useHeaders()
         |             ^",
       "stack": [
         "Foo app/lib.js (4:13)",
       ],
     }
    `)
  })
})
