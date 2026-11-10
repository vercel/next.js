import { nextTestSetup } from 'e2e-utils'

describe('ssr-owner-stack-source-maps', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('shows sourcemapped Server Component frames of SSR owner stacks in the dev overlay', async () => {
    const browser = await next.browser('/')

    await expect(browser).toDisplayCollapsedRedbox(`
     {
       "description": "Next.js encountered URL data useSearchParams() in a Client Component outside of Suspense.",
       "environmentLabel": "Server",
       "label": "Blocking Route",
       "source": "app/client.tsx (10:18) @ ReadSearchParams
     > 10 |   useSearchParams()
          |                  ^",
       "stack": [
         "ReadSearchParams app/client.tsx (10:18)",
         "ServerComponent app/page.tsx (4:10)",
         "Page app/page.tsx (8:10)",
       ],
     }
    `)
  })
})
