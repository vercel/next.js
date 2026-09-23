import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('app-dir - server-actions-redirect-middleware-rewrite.test', () => {
  const { isNextDeploy, next } = nextTestSetup({
    files: __dirname,
  })

  it('should redirect correctly in nodejs runtime with middleware rewrite', async () => {
    const browser = await next.browser('/server-action/node')
    await browser.waitForElementByCss('button').click()

    await retry(async () => {
      expect(await browser.waitForElementByCss('#redirected').text()).toBe(
        'Redirected'
      )
    })
    expect(await browser.url()).toBe(`${next.url}/redirect`)
  })

  it('should redirect correctly in edge runtime with middleware rewrite', async () => {
    const browser = await next.browser('/server-action/edge')
    const actionResponseStatuses: number[] = []
    browser.on('response', (res) => {
      if (res.request().method() === 'POST') {
        actionResponseStatuses.push(res.status())
      }
    })

    await browser.waitForElementByCss('button').click()

    if (isNextDeploy) {
      // FIXME: Real regression from the #96011 backport (3eaa59f0681): the
      // edge action POST 500s on Vercel because createRedirectRenderResult
      // in packages/next/src/server/app-render/action-handler.ts requires
      // the initURL request meta, which the 15.5.x edge-function path never
      // sets. Canary sets it in route-module.ts (#88831).
      await retry(async () => {
        expect(actionResponseStatuses).toContain(500)
      })
    } else {
      await retry(async () => {
        expect(await browser.waitForElementByCss('#redirected').text()).toBe(
          'Redirected'
        )

        expect(await browser.url()).toBe(`${next.url}/redirect`)
      })
    }
  })
})
