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
          // TODO(veil): The stack frames should be source-mapped.
          message: expect.stringContaining(`Debug: Dynamic usage detected
    at getUserAgent (rsc://React/Server/webpack-internal:///(rsc)/./app/headers/lib.ts?0:6:25)
    at indirect (rsc://React/Server/webpack-internal:///(rsc)/./app/headers/page.tsx?1:18:68)
    at Page (rsc://React/Server/webpack-internal:///(rsc)/./app/headers/page.tsx?2:31:26)`),
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
})
