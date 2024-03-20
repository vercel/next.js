import type { NextFixture } from './next-fixture'

type StubFunction = (...args: unknown[]) => unknown
export type NextStubFixture = (
  fn: StubFunction,
  args: unknown[],
  stubData: unknown
) => void

export async function applyNextStubFixture(
  use: (fixture: NextStubFixture) => Promise<void>,
  {
    next,
  }: {
    next: NextFixture
  }
): Promise<void> {
  /**
   * Stubs a function with the given arguments and return the given data
   * @param fn The function to stub
   * @param args The function's arguments
   * @param stubData The stubbed data to return in place of the real function
   *
   * @example
   * ```ts
   * import { test, expect } from '@next/test';
   * import { getUser } from '@/data/user';
   *
   * test('should stub getUser', async ({ page, stub }) => {
   *    stub(getUser, [1], { id: 1, name: 'John Doe' });
   *    page.goto('/user/1');
   *    await expect(page).toContainText('John Doe');
   * });
   * ```
   */
  const stub: NextStubFixture = (fn, args, stubData) => {
    // the pathname consists of the function's name and it's arguments serialized
    const pathname = `/${fn.name}-${args
      .map((arg) => JSON.stringify(arg))
      .join('-')}`

    // Since the `next` fixture is used here, the page fixture will also add the
    // necessary HTTP headers to each request to indicate to Next.js that we want
    // to route fetch requests to the experimental test proxy instead of
    // fetching real data
    next.onFetch((req) => {
      const requestUrl = new URL(req.url)

      if (
        requestUrl.hostname === 'next-experimental-testmode' &&
        requestUrl.pathname === pathname
      ) {
        return new Response(JSON.stringify(stubData), {
          headers: { 'Content-Type': 'application/json' },
        })
      }

      // we tell the proxy server to abort the request if it's not being handled
      return 'abort'
    })
  }

  await use(stub)
}
