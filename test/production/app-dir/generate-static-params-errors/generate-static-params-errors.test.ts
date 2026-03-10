import { nextTestSetup } from 'e2e-utils'

describe('generate-static-params-errors', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  let cliOutputLength: number

  afterEach(async () => {
    await next.stop()
  })

  const buildRoute = async (routePath: string) => {
    cliOutputLength = next.cliOutput.length
    await next.build({ args: ['--debug-build-paths', routePath] })
  }

  const getCliOutput = () => next.cliOutput.slice(cliOutputLength)

  it('should error when cookies() is called inside generateStaticParams', async () => {
    await buildRoute('app/[lang]/cookies/[slug]/page.tsx')
    expect(getCliOutput()).toContain(
      'Error: `cookies` was called outside a request scope. Read more: https://nextjs.org/docs/messages/next-dynamic-api-wrong-context'
    )
  })

  it('should error when headers() is called inside generateStaticParams', async () => {
    await buildRoute('app/[lang]/headers/[slug]/page.tsx')
    expect(getCliOutput()).toContain(
      'Error: `headers` was called outside a request scope. Read more: https://nextjs.org/docs/messages/next-dynamic-api-wrong-context'
    )
  })

  it('should error when connection() is called inside generateStaticParams', async () => {
    await buildRoute('app/[lang]/connection/[slug]/page.tsx')
    expect(getCliOutput()).toContain(
      'Error: `connection` was called outside a request scope. Read more: https://nextjs.org/docs/messages/next-dynamic-api-wrong-context'
    )
  })

  it('should error when draftMode() is called inside generateStaticParams', async () => {
    await buildRoute('app/[lang]/draft-mode/[slug]/page.tsx')
    expect(getCliOutput()).toContain(
      'Error: `draftMode` was called outside a request scope. Read more: https://nextjs.org/docs/messages/next-dynamic-api-wrong-context'
    )
  })

  it('should error when root params are accessed inside generateStaticParams', async () => {
    await buildRoute('app/[lang]/root-params/[slug]/page.tsx')
    expect(getCliOutput()).toContain(
      "Error: Route /[lang]/root-params/[slug] used `import('next/root-params').lang()` outside of a Server Component. This is not allowed."
    )
  })
})
