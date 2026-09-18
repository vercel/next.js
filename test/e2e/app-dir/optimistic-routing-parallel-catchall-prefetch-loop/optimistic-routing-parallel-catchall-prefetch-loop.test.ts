import { nextTestSetup } from 'e2e-utils'
import { createRouterAct } from 'router-act'
import type { Page, Request } from 'playwright'

describe('optimistic-routing-parallel-catchall-prefetch-loop', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    // Known Routes prediction is only used in production builds.
    test('skipped in dev mode', () => {})
    return
  }

  const MAX_RSC_REQUESTS_PER_PATH = 25

  it('does not reuse stale params from active parallel catch-all slots', async () => {
    let act: ReturnType<typeof createRouterAct>
    const rscRequestCounts = new Map<string, number>()
    let excessRequests: string | null = null
    let rejectOnExcess!: (error: Error) => void
    const excessDetected = new Promise<never>((_, reject) => {
      rejectOnExcess = reject
    })
    excessDetected.catch(() => {})

    async function actExpectingToSettle<T>(
      scope: () => Promise<T> | T,
      config?: Parameters<typeof act>[1]
    ): Promise<unknown> {
      const actPromise = act(scope, config)
      actPromise.catch(() => {})
      return Promise.race([actPromise, excessDetected])
    }

    const browser = await next.browser('/dashboard', {
      beforePageLoad(page: Page) {
        act = createRouterAct(page)
        page.on('request', (request: Request) => {
          if (request.headers().rsc === undefined) {
            return
          }
          const pathname = new URL(request.url()).pathname
          const count = (rscRequestCounts.get(pathname) ?? 0) + 1
          rscRequestCounts.set(pathname, count)
          if (count > MAX_RSC_REQUESTS_PER_PATH && excessRequests === null) {
            excessRequests =
              `Observed more than ${MAX_RSC_REQUESTS_PER_PATH} RSC requests ` +
              `for ${pathname}`
            rejectOnExcess(
              new Error(`Prefetch livelock detected: ${excessRequests}`)
            )
          }
        })
      },
    })

    expect(await browser.elementById('dashboard-heading').text()).toBe(
      'Dashboard'
    )

    await actExpectingToSettle(async () => {
      for (const id of ['alpha', 'beta', 'gamma', 'delta', 'epsilon']) {
        for (const href of [`/projects/${id}`, `/projects/${id}/edit`]) {
          await browser
            .elementByCss(`input[data-link-accordion="${href}"]`)
            .click()
        }
      }
    })
    expect(excessRequests).toBeNull()

    await actExpectingToSettle(async () => {
      await browser.elementByCss('a[href="/projects/beta/edit"]').click()
    })
    expect(await browser.elementById('edit-heading').text()).toBe(
      'Edit project beta'
    )
    expect(await browser.elementById('header-slot').text()).toBe(
      'Header projects/beta/edit'
    )
    expect(await browser.elementById('secondary-slot').text()).toBe(
      'Secondary projects/beta/edit'
    )
    expect(excessRequests).toBeNull()
  })
})
