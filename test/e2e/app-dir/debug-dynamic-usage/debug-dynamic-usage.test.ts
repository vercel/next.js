import { nextTestSetup } from 'e2e-utils'

describe('debug-dynamic-usage', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    startOptions: ['--debug'],
  })

  let cliOutputLength: number

  beforeEach(() => {
    cliOutputLength = next.cliOutput.length
  })

  it('shows dynamic usage log when headers() is used', async () => {
    const browser = await next.browser('/headers')
    const logs = await browser.log()

    expect(logs).toMatchObject(
      expect.arrayContaining([
        expect.objectContaining({
          // TODO(veil): The stack frames should be source-mapped. Using
          // `stringMatching`+`RegExp` instead of `stringContaining` to avoid
          // dealing with Webpack/Turbopack differences in the un-source-mapped
          // frames. In any case, there should be no rsc://React/Server/ prefix.
          message: expect.stringMatching(
            new RegExp(
              `Debug: Dynamic usage detected
    at getUserAgent \\(rsc://React/Server/.*\\)
    at indirect \\(rsc://React/Server/.*\\)
    at Page \\(rsc://React/Server/.*\\)`,
              'm'
            )
          ),
        }),
      ])
    )

    expect(next.cliOutput.slice(cliOutputLength)).toInclude(`
 ⚠ Debug: Dynamic usage detected
    at getUserAgent (app/headers/lib.ts:4:22)
    at indirect (app/headers/page.tsx:8:28)
    at Page (app/headers/page.tsx:15:27)
  2 |
  3 | export async function getUserAgent(headers: Promise<ReadonlyHeaders>) {
> 4 |   const headersList = await headers
    |                      ^
  5 |   const userAgent = headersList.get('user-agent')
  6 |
  7 |   return userAgent`)
  })

  it.skip('shows dynamic usage log when connection() is used', async () => {})
  it.skip('shows dynamic usage log when cookies() is used', async () => {})
  it.skip('shows dynamic usage log when params prop is used', async () => {})
  it.skip('shows dynamic usage log when searchParams prop is used', async () => {})
  it.skip('shows dynamic usage log when useParams() is used', async () => {})
  it.skip('shows dynamic usage log when useSearchParams() is used', async () => {})
})
