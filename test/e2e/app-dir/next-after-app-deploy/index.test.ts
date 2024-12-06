/* eslint-env jest */
import { nextTestSetup, isNextDev } from 'e2e-utils'
import { retry } from 'next-test-utils'

const runtimes = ['nodejs', 'edge']

const WAIT_BEFORE_REVALIDATING = 1000

// If we want to verify that `after()` ran its callback,
// we need it to perform some kind of side effect (because it can't affect the response).
// In other tests, we often use logs for this, but we don't have access to those in deploy tests.
// So instead this test relies on calling `unstable_expirePath` inside `after`
// to revalidate an ISR page '/timestamp/key/[key]', and then checking if the timestamp changed --
// if it did, we successfully ran the callback (and performed a side effect).

// This test relies on revalidating a static page, so it can't work in dev mode.
const _describe = isNextDev ? describe.skip : describe

_describe.each(runtimes)('after() in %s runtime', (runtimeValue) => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    env: { WAIT_BEFORE_REVALIDATING: WAIT_BEFORE_REVALIDATING + '' },
  })
  const retryDuration = WAIT_BEFORE_REVALIDATING * 2

  if (skipped) return
  const pathPrefix = '/' + runtimeValue

  type PageInfo = {
    key: string
    timestamp: number
  }

  const getTimestampPageData = async (path: string): Promise<PageInfo> => {
    const fullPath = `/timestamp/key/${encodeURIComponent(path)}`
    const $ = await next.render$(fullPath)
    const dataStr = $('#page-info').text()
    if (!dataStr) {
      throw new Error(`No page data found for '${fullPath}'`)
    }
    return JSON.parse(dataStr) as PageInfo
  }

  const getInitialTimestampPageData = async (path: string) => {
    // FIXME: this seems like a bug in PPR --
    // despite the page being static, the first two requests both cause a render
    // and only the second one gets cached and re-used.
    // we work around it by doing a dummy request to get that first "uncached" request out of the way.
    if (process.env.__NEXT_EXPERIMENTAL_PPR) {
      await getTimestampPageData(path)
    }

    const data = await getTimestampPageData(path)
    expect(data).toEqual(await getTimestampPageData(path)) // sanity check that it's static
    return data
  }

  it('triggers revalidate from a page', async () => {
    const path = pathPrefix + '/dynamic-page'
    const dataBefore = await getInitialTimestampPageData(path)

    await next.render(path) // trigger revalidate

    await retry(
      async () => {
        const dataAfter = await getTimestampPageData(path)
        expect(dataAfter.timestamp).toBeGreaterThan(dataBefore.timestamp)
      },
      retryDuration,
      1000,
      'check if timestamp page updated'
    )
  })

  it('triggers revalidate from a server action', async () => {
    const path = pathPrefix + '/server-action'
    const dataBefore = await getInitialTimestampPageData(path)

    const session = await next.browser(path)
    await session.elementByCss('button[type="submit"]').click() // trigger revalidate

    await retry(
      async () => {
        const dataAfter = await getTimestampPageData(path)
        expect(dataAfter.timestamp).toBeGreaterThan(dataBefore.timestamp)
      },
      retryDuration,
      1000,
      'check if timestamp page updated'
    )
  })

  it('triggers revalidate from a route handler', async () => {
    const path = pathPrefix + '/route'
    const dataBefore = await getInitialTimestampPageData(path)

    await next.fetch(path).then((res) => res.text()) // trigger revalidate

    await retry(
      async () => {
        const dataAfter = await getTimestampPageData(path)
        expect(dataAfter.timestamp).toBeGreaterThan(dataBefore.timestamp)
      },
      retryDuration,
      1000,
      'check if timestamp page updated'
    )
  })

  it('triggers revalidate from middleware', async () => {
    const path = pathPrefix + '/middleware'
    const dataBefore = await getInitialTimestampPageData(path)

    await next.render(path) // trigger revalidate

    await retry(
      async () => {
        const dataAfter = await getTimestampPageData(path)
        expect(dataAfter.timestamp).toBeGreaterThan(dataBefore.timestamp)
      },
      retryDuration,
      1000,
      'check if timestamp page updated'
    )
  })
})
