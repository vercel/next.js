/* eslint-env jest */
import { nextTestSetup, isNextDev } from 'e2e-utils'
import { assertHasRedbox, getRedboxSource, retry } from 'next-test-utils'
import * as Log from './utils/log'

// using after is a compile-time error in build mode.
const _describe = isNextDev ? describe : describe.skip

_describe('after() - pages', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  let currentCliOutputIndex = 0
  beforeEach(() => {
    currentCliOutputIndex = next.cliOutput.length
  })

  const getLogs = () => {
    return Log.readCliLogs(next.cliOutput.slice(currentCliOutputIndex))
  }

  it('runs in middleware', async () => {
    const requestId = `${Date.now()}`
    const res = await next.fetch(
      `/middleware/redirect-source?requestId=${requestId}`,
      {
        redirect: 'follow',
        headers: {
          cookie: 'testCookie=testValue',
        },
      }
    )

    expect(res.status).toBe(200)
    await retry(() => {
      expect(getLogs()).toContainEqual({
        source: '[middleware] /middleware/redirect-source',
        requestId,
        cookies: { testCookie: 'testValue' },
      })
    })
  })

  describe('invalid usages', () => {
    describe('errors at compile time when used in pages dir', () => {
      it.each([
        {
          title: 'errors when used in getServerSideProps',
          path: '/pages-dir/invalid-in-gssp',
        },
        {
          title: 'errors when used in getStaticProps',
          path: '/pages-dir/123/invalid-in-gsp',
        },
        {
          title: 'errors when used in within a page component',
          path: '/pages-dir/invalid-in-page',
        },
      ])('$title', async ({ path }) => {
        const browser = await next.browser(path)

        await assertHasRedbox(browser)
        expect(await getRedboxSource(browser)).toMatch(
          /You're importing a component that needs "?after"?\. That only works in a Server Component which is not supported in the pages\/ directory\./
        )
        expect(getLogs()).toHaveLength(0)
      })
    })
  })
})
