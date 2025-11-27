import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('app-dir - metadata-streaming', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should only insert metadata once for parallel routes when slots match', async () => {
    const browser = await next.browser('/parallel-routes')

    expect((await browser.elementsByCss('title')).length).toBe(1)
    expect(await browser.elementByCss('title').text()).toBe('parallel title')

    const $ = await next.render$('/parallel-routes')
    expect($('title').length).toBe(1)
    // We can't ensure if it's inserted into head or body since it's a race condition,
    // where sometimes the metadata can be suspended.
    expect($('title').text()).toBe('parallel title')

    // validate behavior remains the same on client navigations
    await browser.elementByCss('[href="/parallel-routes/test-page"]').click()

    await retry(async () => {
      expect(await browser.elementByCss('title').text()).toContain(
        'Dynamic api'
      )
    })

    expect((await browser.elementsByCss('title')).length).toBe(1)
  })

  it('should only insert metadata once for parallel routes when there is a missing slot', async () => {
    const browser = await next.browser('/parallel-routes')
    await browser.elementByCss('[href="/parallel-routes/no-bar"]').click()

    // Wait for navigation is finished and metadata is updated
    await retry(async () => {
      expect(await browser.elementByCss('title').text()).toContain(
        'Dynamic api'
      )
    })

    await retry(async () => {
      expect((await browser.elementsByCss('title')).length).toBe(1)
    })
  })

  it('should still render metadata if children is not rendered in parallel routes layout', async () => {
    const browser = await next.browser('/parallel-routes-default')

    expect((await browser.elementsByCss('title')).length).toBe(1)
    expect(await browser.elementByCss('title').text()).toBe(
      'parallel-routes-default layout title'
    )

    const $ = await next.render$('/parallel-routes-default')
    expect($('title').length).toBe(1)
    expect($('body title').text()).toBe('parallel-routes-default layout title')
  })

  it('should change metadata when navigating between two pages under a slot when children is not rendered', async () => {
    // first page is /parallel-routes-no-children/first,
    // second page is /parallel-routes-no-children/second
    // navigating between them should change the title metadata
    const browser = await next.browser('/parallel-routes-no-children/first')
    await retry(async () => {
      expect(await browser.elementByCss('title').text()).toBe(
        'first page - @bar'
      )
    })
    // go to second page
    await browser
      .elementByCss('[href="/parallel-routes-no-children/second"]')
      .click()
    // wait for navigation to finish
    await retry(async () => {
      expect(await browser.elementByCss('#bar-page').text()).toBe(
        'test-page @bar - 2'
      )
    })
    expect(await browser.elementByCss('title').text()).toBe(
      'second page - @bar'
    )
  })
})
