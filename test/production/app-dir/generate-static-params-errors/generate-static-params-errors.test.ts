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
      'Error: Route /[lang]/cookies/[slug] used `cookies()` inside `generateStaticParams`. This is not supported because `generateStaticParams` runs at build time without an HTTP request. Read more: https://nextjs.org/docs/messages/next-dynamic-api-wrong-context'
    )
  })

  it('should error when headers() is called inside generateStaticParams', async () => {
    await buildRoute('app/[lang]/headers/[slug]/page.tsx')
    expect(getCliOutput()).toContain(
      'Error: Route /[lang]/headers/[slug] used `headers()` inside `generateStaticParams`. This is not supported because `generateStaticParams` runs at build time without an HTTP request. Read more: https://nextjs.org/docs/messages/next-dynamic-api-wrong-context'
    )
  })

  it('should error when connection() is called inside generateStaticParams', async () => {
    await buildRoute('app/[lang]/connection/[slug]/page.tsx')
    expect(getCliOutput()).toContain(
      'Error: Route /[lang]/connection/[slug] used `connection()` inside `generateStaticParams`. This is not supported because `generateStaticParams` runs at build time without an HTTP request. Read more: https://nextjs.org/docs/messages/next-dynamic-api-wrong-context'
    )
  })

  it('should error when draftMode() is called inside generateStaticParams', async () => {
    await buildRoute('app/[lang]/draft-mode/[slug]/page.tsx')
    expect(getCliOutput()).toContain(
      'Error: Route /[lang]/draft-mode/[slug] used `draftMode()` inside `generateStaticParams`. This is not supported because `generateStaticParams` runs at build time without an HTTP request. Read more: https://nextjs.org/docs/messages/next-dynamic-api-wrong-context'
    )
  })

  it('should allow root params access inside generateStaticParams', async () => {
    await buildRoute('app/[lang]/root-params/[slug]/page.tsx')
    expect(getCliOutput()).not.toContain('Error')
  })
})
