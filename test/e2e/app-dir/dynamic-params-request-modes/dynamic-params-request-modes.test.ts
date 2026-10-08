import { load } from 'cheerio'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('dynamicParams: false request modes', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it.each(['document', 'head', 'navigation', 'prefetch', 'bot'])(
    'admits only generated paths for a %s request',
    async (kind) => {
      const headers: Record<string, string> = {}
      if (kind === 'navigation' || kind === 'prefetch') headers.RSC = '1'
      if (kind === 'prefetch') headers['Next-Router-Prefetch'] = '1'
      if (kind === 'bot') headers['user-agent'] = 'Googlebot'
      const options = { headers, method: kind === 'head' ? 'HEAD' : 'GET' }

      const known = await next.fetch('/products/known', options)
      expect(known.status).toBe(200)
      const unlisted = await next.fetch('/products/unlisted', options)
      expect(unlisted.status).toBe(404)
      if (kind === 'head') {
        expect(await known.text()).toBe('')
        expect(await unlisted.text()).toBe('')
      }
    }
  )

  it('checks the rewritten destination against the generated paths', async () => {
    const known = await next.fetch('/alias/known')
    expect(known.status).toBe(200)
    expect(load(await known.text())('#slug').text()).toBe('known')
    expect((await next.fetch('/alias/unlisted')).status).toBe(404)
  })

  it('can try a less specific route after rejecting a closed matcher', async () => {
    const known = await next.fetch('/overlap/known')
    expect(known.status).toBe(200)
    expect(load(await known.text())('#specific').text()).toBe('Specific route')

    const unlisted = await next.fetch('/overlap/unlisted')
    expect(unlisted.status).toBe(200)
    expect(load(await unlisted.text())('#catch-all').text()).toBe('unlisted')
  })

  async function enableDraftMode() {
    const response = await next.fetch('/draft')
    expect(response.status).toBe(204)
    const cookie = response.headers.get('set-cookie')!.split(';')[0]
    expect(cookie).toMatch(/^__prerender_bypass=/)
    return cookie
  }

  // Existing adapter routing requires legacy preview cookies and rejects App
  // Router draft requests to unlisted closed URLs before Next.js handles them.
  // @force-gate !deploy
  it('previews an unlisted path without admitting it for ordinary requests', async () => {
    expect((await next.fetch('/products/unpublished')).status).toBe(404)
    const cookie = await enableDraftMode()
    const draft = await next.fetch('/products/unpublished', {
      headers: { cookie },
    })
    expect(draft.status).toBe(200)
    expect(draft.headers.get('cache-control')).toContain('no-store')
    const $ = load(await draft.text())
    expect($('#slug').text()).toBe('unpublished')
    expect($('#draft').text()).toBe('draft')
    expect((await next.fetch('/products/unpublished')).status).toBe(404)
  })

  // Dev deliberately does not reuse the Full Route Cache.
  // @force-gate prod
  it('does not read or replace the public cache when previewing a known path', async () => {
    const before = await next.render$('/products/known')
    const generation = before('#generation').text()
    expect(generation).not.toBe('')
    const cookie = await enableDraftMode()
    const draft = await next.fetch('/products/known', { headers: { cookie } })
    expect(draft.status).toBe(200)
    const $ = load(await draft.text())
    expect($('#draft').text()).toBe('draft')
    expect($('#generation').text()).not.toBe(generation)
    const after = await next.render$('/products/known')
    expect(after('#generation').text()).toBe(generation)
    expect(after('#draft').text()).toBe('published')
  })

  it('runs a Server Action and revalidates the currently rendered closed path', async () => {
    const browser = await next.browser('/products/known')
    const generation = await browser.elementById('generation').text()
    await browser.elementById('call-action').click()
    await retry(async () => {
      expect(await browser.elementById('action-result').text()).toBe(
        'action completed'
      )
      expect(await browser.elementById('generation').text()).not.toBe(
        generation
      )
    })
    expect(await browser.elementById('slug').text()).toBe('known')
  })

  it('forwards a retained Server Action to its closed route after navigating away', async () => {
    const browser = await next.browser('/products/forwarded')
    await retry(async () => {
      expect(await browser.elementById('action-ready').text()).toBe('ready')
    })
    await browser.elementById('navigate-home').click()
    await browser.waitForElementByCss('#home')
    await browser.elementById('call-retained-action').click()
    await retry(async () => {
      expect(await browser.elementById('action-result').text()).toBe(
        'action completed'
      )
    })
    expect(await browser.hasElementByCssSelector('#home')).toBe(true)
    expect(await browser.hasElementByCssSelector('#product')).toBe(false)
  })
})
