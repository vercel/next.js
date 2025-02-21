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
  let pendingRequests = new Map()
  let TestLog = createTestLog()

  let next
  beforeAll(async () => {
    port = await findPort()
    let isFinishedBuilding = false
    server = createTestDataServer(async (key, res) => {
      if (!isFinishedBuilding) {
        res.resolve('Initial value during build for: ' + key)
        return
      }
      if (pendingRequests.has(key)) {
        throw new Error('Request already pending for: ' + key)
      }
      pendingRequests.set(key, res)
      TestLog.log('REQUEST: ' + key)
    })
    server.listen(port)

    next = await createNext({
      files: __dirname,
      env: { TEST_DATA_SERVICE_URL: `http://localhost:${port}` },
    })
    isFinishedBuilding = true
  })

  afterEach(async () => {
    pendingRequests = new Map()
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
      'input[type="checkbox"]'
    )

    // Reveal the link the target page to trigger a prefetch
    await act(
      async () => {
        await linkVisibilityToggle.click()
      },
      {
        includes: 'Greeting',
      }
    )

    // Hide the link so we can reveal it again later to trigger another
    // prefetch task
    await linkVisibilityToggle.click()

    // Perform an action that calls revalidatePath. This should cause the
    // corresponding entry to be evicted from the client cache.
    await act(async () => {
      const revalidateByPath = await browser.elementById('revalidate-by-path')
      await revalidateByPath.click()
    })

    await act(
      async () => {
        // Reveal the link
        await linkVisibilityToggle.click()

        // Because the corresponding entry was evicted from the cache, this
        // should trigger a new prefetch.
        await TestLog.waitFor(['REQUEST: random-greeting'])

        // Fulfill the prefetch request.
        await pendingRequests.get('random-greeting').resolve('yo!')
      },
      {
        includes: 'yo!',
      }
    )

    // Navigate to the target page.
    await act(async () => {
      const link = await browser.elementByCss('a[href="/greeting"]')
      await link.click()
      // Navigation should finish immedately because the page is
      // fully prefetched.
      const greeting = await browser.elementById('greeting')
      expect(await greeting.innerHTML()).toBe('yo!')
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
      'input[type="checkbox"]'
    )

    // Reveal the link the target page to trigger a prefetch
    await act(
      async () => {
        await linkVisibilityToggle.click()
      },
      {
        includes: 'Greeting',
      }
    )

    // Hide the link so we can reveal it again later to trigger another
    // prefetch task
    await linkVisibilityToggle.click()

    // Perform an action that calls revalidateTag. This should cause the
    // corresponding entry to be evicted from the client cache.
    await act(async () => {
      const revalidateByPath = await browser.elementById('revalidate-by-tag')
      await revalidateByPath.click()
    })

    await act(
      async () => {
        // Reveal the link
        await linkVisibilityToggle.click()

        // Because the corresponding entry was evicted from the cache, this
        // should trigger a new prefetch.
        await TestLog.waitFor(['REQUEST: random-greeting'])

        // Fulfill the prefetch request.
        await pendingRequests.get('random-greeting').resolve('hey!')
      },
      {
        includes: 'hey!',
      }
    )

    // Navigate to the target page.
    await act(async () => {
      const link = await browser.elementByCss('a[href="/greeting"]')
      await link.click()
      // Navigation should finish immedately because the page is
      // fully prefetched.
      const greeting = await browser.elementById('greeting')
      expect(await greeting.innerHTML()).toBe('hey!')
    }, 'no-requests')
  })
})
