import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('app-dir - metadata-streaming', () => {
  const { next, isNextDeploy } = nextTestSetup({
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
    expect($('title').text()).toBe('parallel-routes-default layout title')
  })

  it('should prefer children when it defines metadata', async () => {
    const $ = await next.render$('/parallel-routes/metadata-conflict')
    expect($('title').text()).toBe('children title')

    const browser = await next.browser('/parallel-routes/metadata-conflict')
    expect(await browser.elementByCss('title').text()).toBe('children title')
    expect((await browser.elementsByCss('title')).length).toBe(1)
  })

  it('should prefer a named slot when children does not define metadata', async () => {
    const $ = await next.render$('/parallel-routes/metadata-slot-only')
    const icons = $('link[rel="icon"]')
      .map((_, element) => $(element).attr('href'))
      .get()

    expect(icons).toContainEqual(
      expect.stringContaining('/parallel-routes/metadata-slot-only/icon')
    )
  })

  it('should ignore metadata errors from unrendered slots', async () => {
    const outputIndex = next.cliOutput.length
    const $ = await next.render$('/conditional-slot')

    expect($('title').text()).toBe('conditional children title')
    expect($('#conditional-children').text()).toBe('conditional children')
    expect($('.next-error-h1').length).toBe(0)

    if (!isNextDeploy) {
      await retry(() => {
        const output = next.cliOutput.slice(outputIndex)
        expect(output).toContain('unrendered slot metadata error')
        expect(output).toContain('unrendered slot image metadata error')
        expect(output).toContain('unrendered slot viewport error')
        expect(output).not.toContain('Array.map (<anonymous>)')
        expect(output).not.toContain('Function.all (<anonymous>)')
      })
    }
  })

  it('should start generators in every branch before their parent resolves', async () => {
    const $ = await next.render$('/eager-generation')

    expect($('title').text()).toBe('eager children title')
    expect($('meta[name="description"]').attr('content')).toBe(
      'parallel generators started eagerly'
    )
    expect($('meta[name="color-scheme"]').attr('content')).toBe('dark')
    expect($('#eager-children').text()).toBe('eager children')
    expect($('#eager-slot').text()).toBe('eager slot')
  })

  it('should replay a viewport error without waiting for metadata in the same outlet', async () => {
    const browser = await next.browser('/outlet-error-start')
    await browser.elementByCss('#independent-outlet-errors-link').click()

    await retry(async () => {
      expect(await browser.elementByCss('#outlet-viewport-error').text()).toBe(
        'viewport error reached boundary'
      )
    })
  })

  it('should prefer the deeper named slot metadata', async () => {
    const $ = await next.render$('/metadata-selection/deepest')
    expect($('title').text()).toBe('foo deeper title')
  })

  it('should use lexical slot order to break depth ties', async () => {
    const $ = await next.render$('/metadata-selection/lexical')
    expect($('title').text()).toBe('bar lexical title')
  })

  it('should allow a layout to select metadata and viewport handles independently', async () => {
    const $ = await next.render$('/selector-handle')
    expect($('title').text()).toBe('selected bar title')
    expect($('meta[name="color-scheme"]').attr('content')).toBe('light')
  })

  it('should use the closest selector above a fork', async () => {
    const $ = await next.render$('/selector-ancestor/nested')
    expect($('title').text()).toBe('ancestor selected foo title')
    expect($('meta[name="color-scheme"]').attr('content')).toBe('dark')
  })

  it('should allow a layout to return rewritten selected metadata', async () => {
    const $ = await next.render$('/selector-resolved')
    expect($('title').text()).toBe('rewritten foo title')
    expect($('meta[name="color-scheme"]').attr('content')).toBe('dark')
  })

  it('should pass a resolved nested selection to the next fork', async () => {
    const $ = await next.render$('/selector-nested')
    expect($('title').text()).toBe('nested selected title')
    expect($('meta[name="color-scheme"]').attr('content')).toBe('dark')
  })

  it('should expose navigation status without selecting its slot', async () => {
    const res = await next.fetch('/selector-not-found')
    const $ = await next.render$('/selector-not-found')

    expect(res.status).toBe(200)
    expect($('title').text()).toBe('fallback after not found title')
    expect($('meta[name="color-scheme"]').attr('content')).toBe('dark')
    expect($('#unrendered-not-found-page').length).toBe(0)
  })

  it('should replay selector errors through a rendered outlet', async () => {
    const browser = await next.browser('/selector-error')

    await retry(async () => {
      expect(await browser.elementByCss('#selector-error').text()).toBe(
        'metadata selector error reached boundary'
      )
    })
  })

  it('should replay viewport selector errors through a rendered outlet', async () => {
    const browser = await next.browser('/viewport-selector-error')

    await retry(async () => {
      expect(
        await browser.elementByCss('#viewport-selector-error').text()
      ).toBe('viewport selector error reached boundary')
    })
  })

  it('should prefer a real named slot over an implicit children fallback', async () => {
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
