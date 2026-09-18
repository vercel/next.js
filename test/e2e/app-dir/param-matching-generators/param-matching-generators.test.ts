import { nextTestSetup } from 'e2e-utils'

describe('param-matching-generators', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('allows public cached configuration in a matching generator', async () => {
    for (const slug of ['first', 'novel']) {
      const $ = await next.render$(`/cached/${slug}`)
      expect($('#cached-matcher').text()).toBe(`Cached matcher: ${slug}`)
    }
  })

  it.each(['document', 'navigation'])(
    'advertises closed parameters for an allowed %s, including in dev',
    async (requestKind) => {
      const browser = await next.browser(
        requestKind === 'document' ? '/closed/allowed' : '/'
      )
      if (requestKind === 'navigation') {
        await browser.elementByCss('a[href="/closed/allowed"]').click()
      }
      expect(await browser.elementById('closed-page').text()).toBe(
        'Allowed page'
      )
      const rootHints = await browser.eval(
        'window.history.state.__PRIVATE_NEXTJS_INTERNALS_TREE.tree[4]'
      )
      // HasNotFoundParams is a const enum bit. An allowed request still needs
      // it: other values of the same parameter may be rejected by routing.
      expect((rootHints ?? 0) & 0b1000000000000000).not.toBe(0)
      await browser.close()
    }
  )

  it('does not mark open routes as closed', async () => {
    const browser = await next.browser('/')
    const rootHints = await browser.eval(
      'window.history.state.__PRIVATE_NEXTJS_INTERNALS_TREE.tree[4]'
    )
    expect((rootHints ?? 0) & 0b1000000000000000).toBe(0)
    await browser.close()
  })
})
