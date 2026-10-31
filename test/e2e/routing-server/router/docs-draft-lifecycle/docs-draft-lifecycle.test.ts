import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type { Page } from 'playwright'

// R29 — https://nextjs.org/docs/app/guides/draft-mode
describe('documented Draft Mode browser lifecycle', () => {
  const { next, isNextDev } = nextTestSetup({ files: __dirname })

  it('isolates an editor from a public browser and restores the public view on disable', async () => {
    let publicPage: Page | undefined
    const publicBrowser = await next.browser('/', {
      beforePageLoad(page) {
        publicPage = page
      },
    })
    if (!publicPage) throw new Error('Expected the public visitor page')
    const browser = publicPage.context().browser()
    if (!browser) throw new Error('Expected a browser instance')
    // The webdriver helper shares one context. Use an independent context so
    // the editor and public visitor have different cookie jars.
    const editorContext = await browser.newContext()
    const editor = await editorContext.newPage()

    try {
      await editor.goto(next.url)
      const publicValue = await publicBrowser.elementById('value').text()
      expect(publicValue).toBeTruthy()
      expect(await publicBrowser.elementById('mode').text()).toBe('public')
      expect(await editor.locator('#mode').innerText()).toBe('public')
      if (!isNextDev) {
        expect(await editor.locator('#value').innerText()).toBe(publicValue)
      }

      await editor.goto(`${next.url}/enable`)
      await retry(async () => {
        expect(await editor.locator('#mode').innerText()).toBe('draft')
      })
      const firstDraftValue = await editor.locator('#value').innerText()
      expect(firstDraftValue).not.toBe(publicValue)

      await editor.reload()
      expect(await editor.locator('#mode').innerText()).toBe('draft')
      expect(await editor.locator('#value').innerText()).not.toBe(
        firstDraftValue
      )

      await publicBrowser.refresh()
      expect(await publicBrowser.elementById('mode').text()).toBe('public')
      if (!isNextDev) {
        expect(await publicBrowser.elementById('value').text()).toBe(
          publicValue
        )
      }

      await editor.goto(`${next.url}/disable`)
      await retry(async () => {
        expect(await editor.locator('#mode').innerText()).toBe('public')
      })
      if (!isNextDev) {
        expect(await editor.locator('#value').innerText()).toBe(publicValue)
      }

      await editor.reload()
      expect(await editor.locator('#mode').innerText()).toBe('public')
      if (!isNextDev) {
        expect(await editor.locator('#value').innerText()).toBe(publicValue)
      }
    } finally {
      await Promise.all([publicBrowser.close(), editorContext.close()])
    }
  })

  it('sets and deletes the bypass cookie and keeps draft responses private', async () => {
    const enabled = await next.fetch('/enable', { redirect: 'manual' })
    expect(enabled.status).toBe(307)
    const setCookie = enabled.headers.get('set-cookie')
    expect(setCookie).toContain('__prerender_bypass=')
    const cookie = setCookie.split(';', 1)[0]

    const draft = await next.fetch('/', { headers: { cookie } })
    expect(draft.status).toBe(200)
    expect(draft.headers.get('cache-control')).toContain('no-store')
    if (!isNextDev) {
      expect(draft.headers.get('cache-control')).toContain('private')
    }
    expect(await draft.text()).toContain('draft')

    const disabled = await next.fetch('/disable', {
      redirect: 'manual',
      headers: { cookie },
    })
    expect(disabled.status).toBe(307)
    expect(disabled.headers.get('set-cookie')).toMatch(
      /__prerender_bypass=;.*Expires=Thu, 01 Jan 1970/i
    )
  })
})
