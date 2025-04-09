import { nextTestSetup } from 'e2e-utils'

describe('back/forward cache', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('Activity component is renderable when the routerBFCache flag is on', async () => {
    // None of the back/forward behavior has been implemented yet; this just
    // tests that when the flag is enabled, we're able to successfully render
    // an Activity component.
    const browser = await next.browser('/')
    const activityContent = await browser.elementById('activity-content')
    expect(await activityContent.innerHTML()).toBe('Hello')
    expect(await activityContent.getComputedCss('display')).toBe('none')
  })
})
