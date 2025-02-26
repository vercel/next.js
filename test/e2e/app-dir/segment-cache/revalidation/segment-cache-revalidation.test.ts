import { isNextDev, isNextDeploy, createNext } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from '../router-act'
import { createTestDataServer } from 'test-data-service/writer'
import { createTestLog } from 'test-log'
import { findPort } from 'next-test-utils'

describe('segment cache (revalidation)', () => {
  if (isNextDev || isNextDeploy) {
    test('disabled in development / deployment', () => {})
    return
  }

  let port = -1
  let server
  let dataVersions = new Map()
  let TestLog = createTestLog()

  let next
  beforeAll(async () => {
    port = await findPort()
    server = createTestDataServer(async (key, res) => {
      const currentVersion = dataVersions.get(key)

      // Increment the version number each time to track how often the
      // server renders.
      const nextVersion = currentVersion === undefined ? 1 : currentVersion + 1
      dataVersions.set(key, nextVersion)

      // Append the version number to the response
      const response = `${key} [${nextVersion}]`
      TestLog.log('REQUEST: ' + key)
      res.resolve(response)
    })
    server.listen(port)

    next = await createNext({
      files: __dirname,
      env: { TEST_DATA_SERVICE_URL: `http://localhost:${port}` },
    })
  })

  beforeEach(async () => {
    dataVersions = new Map()
    TestLog = createTestLog()
  })

  afterAll(async () => {
    await next?.destroy()
    server?.close()
  })

  it('evict client cache when Server Action calls revalidatePath', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/', {
      beforePageLoad(page: Playwright.Page) {
        act = createRouterAct(page)
      },
    })

    const linkVisibilityToggle = await browser.elementByCss(
      'input[data-link-accordion="/greeting"]'
    )

    // Reveal the link the target page to trigger a prefetch
    await act(
      async () => {
        await linkVisibilityToggle.click()
      },
      {
        includes: 'random-greeting',
      }
    )

    // Perform an action that calls revalidatePath. This should cause the
    // corresponding entry to be evicted from the client cache, and a new
    // prefetch to be requested.
    await act(
      async () => {
        const revalidateByPath = await browser.elementById('revalidate-by-path')
        await revalidateByPath.click()
      },
      {
        includes: 'random-greeting [1]',
      }
    )
    TestLog.assert(['REQUEST: random-greeting'])

    // Navigate to the target page.
    await act(async () => {
      const link = await browser.elementByCss('a[href="/greeting"]')
      await link.click()
      // Navigation should finish immedately because the page is
      // fully prefetched.
      const greeting = await browser.elementById('greeting')
      expect(await greeting.innerHTML()).toBe('random-greeting [1]')
    }, 'no-requests')
  })

  it('evict client cache when Server Action calls revalidateTag', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/', {
      beforePageLoad(page: Playwright.Page) {
        act = createRouterAct(page)
      },
    })

    const linkVisibilityToggle = await browser.elementByCss(
      'input[data-link-accordion="/greeting"]'
    )

    // Reveal the link the target page to trigger a prefetch.
    await act(
      async () => {
        await linkVisibilityToggle.click()
      },
      {
        includes: 'random-greeting',
      }
    )

    // Perform an action that calls revalidateTag. This should cause the
    // corresponding entry to be evicted from the client cache, and a new
    // prefetch to be requested.
    await act(
      async () => {
        const revalidateByTag = await browser.elementById('revalidate-by-tag')
        await revalidateByTag.click()
      },
      {
        includes: 'random-greeting [1]',
      }
    )
    TestLog.assert(['REQUEST: random-greeting'])

    // Navigate to the target page.
    await act(async () => {
      const link = await browser.elementByCss('a[href="/greeting"]')
      await link.click()
      // Navigation should finish immedately because the page is
      // fully prefetched.
      const greeting = await browser.elementById('greeting')
      expect(await greeting.innerHTML()).toBe('random-greeting [1]')
    }, 'no-requests')
  })

  it('re-fetch visible links after a navigation, if needed', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/refetch-on-new-base-tree/a', {
      beforePageLoad(page: Playwright.Page) {
        act = createRouterAct(page)
      },
    })

    const linkALinkVisibilityToggle = await browser.elementByCss(
      'input[data-link-accordion="/refetch-on-new-base-tree/a"]'
    )
    const linkBLinkVisibilityToggle = await browser.elementByCss(
      'input[data-link-accordion="/refetch-on-new-base-tree/b"]'
    )

    // Reveal the links to trigger prefetches
    await act(async () => {
      await linkALinkVisibilityToggle.click()
      await linkBLinkVisibilityToggle.click()
    }, [
      // Page B's content should have been prefetched
      {
        includes: 'Page B content',
      },
      // Page A's content should not be prefetched because we're already on that
      // page. When prefetching with `prefetch={true}`, we only prefetch the
      // delta between the current route and the target route.
      {
        includes: 'Page A content',
        block: 'reject',
      },
    ])

    // Navigate to page B
    await act(
      async () => {
        const link = await browser.elementByCss(
          'a[href="/refetch-on-new-base-tree/b"]'
        )
        await link.click()
        const content = await browser.elementById('page-b-content')
        expect(await content.innerHTML()).toBe('Page B content')
      },
      // The link for page A is re-prefetched again, even though it's an
      // existing link, because the delta between the current route and the
      // target route has changed.
      //
      // This time, the response does include the content for page A.
      {
        includes: 'Page A content',
      }
    )

    // Navigate to page A
    await act(
      async () => {
        const link = await browser.elementByCss(
          'a[href="/refetch-on-new-base-tree/a"]'
        )
        await link.click()
        const content = await browser.elementById('page-a-content')
        expect(await content.innerHTML()).toBe('Page A content')
      },
      // There should be no new requests because everything is fully prefetched.
      'no-requests'
    )
  })
})
