import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { setTimeout } from 'node:timers/promises'

async function stable(action: () => Promise<void>, stableForMS: number = 1000) {
  // Wait for it to reach the initial state.
  await retry(async () => {
    await action()
  })

  // Wait for the stableForMS to ensure that it doesn't change.
  for (let i = 0; i < 10; i++) {
    await action()
    await setTimeout(stableForMS / 10)
  }
}

describe('parallel-route-navigations', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  // We're skipping this in development because there's no prefetching
  // during development.
  if (isNextDev) {
    it.skip('skipping in dev', async () => {
      await Promise.resolve()
    })
    return
  }

  it('should render the right parameters on the server', async () => {
    const $ = await next.render$('/vercel/sub/folder')

    expect({
      client: $(
        '[data-client-file="/[teamID]/@slot/[...catchAll]/page.tsx"][data-client-params]'
      ).data('client-params'),
      server: $(
        '[data-server-file="/[teamID]/@slot/[...catchAll]/page.tsx"][data-server-params]'
      ).data('server-params'),
    }).toEqual({
      client: {
        teamID: 'vercel',
        catchAll: ['sub', 'folder'],
      },
      server: {
        teamID: 'vercel',
        catchAll: ['sub', 'folder'],
      },
    })
  })

  it('should render the right parameters on client navigations', async () => {
    let hadLocked = 0
    let lock: Promise<void> | false = false

    const browser = await next.browser('/vercel/sub/folder', {
      beforePageLoad(page) {
        page.route('**/*', async (route, request) => {
          if (lock) {
            hadLocked++
            await lock
          }

          await route.continue()
        })
      },
    })

    // Wait for the network idle state, then pause the network requests to the
    // other folder. This will let us inspect the pre-dynamic render navigation
    // state.
    await browser.waitForIdleNetwork()

    let unlock: () => void
    lock = new Promise((resolve) => {
      unlock = resolve
    })

    // Click the navigation link, and wait for the new page component to load.
    await browser.elementByCss('a[href="/vercel/sub/other-folder"]').click()

    // If it's PPR or Cache Components, we'll see an immediate transition for
    // the client component.
    if (process.env.__NEXT_CACHE_COMPONENTS === 'true') {
      await browser.waitForElementByCss(
        '[data-file="/[teamID]/sub/other-folder/page.tsx"]'
      )

      // Now we should look at the dom and see what the parameters are set to.
      const client = await browser
        .elementByCss(
          '[data-client-file="/[teamID]/@slot/[...catchAll]/page.tsx"][data-client-params]'
        )
        .getAttribute('data-client-params')

      expect(JSON.parse(client)).toEqual({
        teamID: 'vercel',
        catchAll: ['sub', 'other-folder'],
      })
    }

    // Wait for the dynamic RSC request to lock, then unlock that request.
    await stable(async () => {
      // As Client Segment Cache is the default, we should see one dynamic
      // request.
      expect(hadLocked).toBe(1)
    })
    unlock()

    // Now we should look at the dom and see what the parameters are set to and
    // that they remain the same.
    await stable(async () => {
      const client = await browser
        .elementByCss(
          '[data-client-file="/[teamID]/@slot/[...catchAll]/page.tsx"][data-client-params]'
        )
        .getAttribute('data-client-params')

      expect(JSON.parse(client)).toEqual({
        teamID: 'vercel',
        catchAll: ['sub', 'other-folder'],
      })
    })
  })
})
