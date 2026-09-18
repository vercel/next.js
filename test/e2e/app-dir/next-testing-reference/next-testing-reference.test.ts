import { nextTestSetup } from 'e2e-utils'
import { instant } from '@next/playwright'
import { retry } from 'next-test-utils'
import type { Page } from 'playwright'

describe('next-testing-reference', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it('renders the ordinary subject through the application compiler', async () => {
    const $ = await next.render$('/')
    expect($('#unit-result').text()).toBe('10')
  })

  it('renders nested async server-only work and isolates request cookies', async () => {
    const [alice, bob, anonymous] = await Promise.all([
      next.render$(
        '/reference',
        {},
        { headers: { cookie: 'reference-visitor=alice' } }
      ),
      next.render$(
        '/reference',
        {},
        { headers: { cookie: 'reference-visitor=bob' } }
      ),
      next.render$('/reference'),
    ])
    expect(alice('#visitor').text()).toBe('alice')
    expect(bob('#visitor').text()).toBe('bob')
    expect(anonymous('#visitor').text()).toBe('anonymous')
    expect(anonymous('#nested-message').text()).toBe('server sum: 10')
    expect(anonymous('#counter').text()).toBe('Count: 10')
  })

  it('shows the instant shell, releases server work, and hydrates the client boundary', async () => {
    let page: Page
    const browser = await next.browser('/', {
      beforePageLoad(p) {
        page = p
      },
    })
    try {
      await instant(page!, async () => {
        await page!.click('#reference-link')
        await page!.locator('#loading').waitFor({ state: 'visible' })
        expect(await page!.locator('h1').textContent()).toBe('Reference shell')
        expect(await page!.locator('#completed').count()).toBe(0)
      })
      await page!.locator('#completed').waitFor({ state: 'visible' })
      expect(await page!.locator('#nested-message').textContent()).toBe(
        'server sum: 10'
      )
      await page!.click('#counter')
      await retry(async () => {
        expect(await page!.locator('#counter').textContent()).toBe('Count: 11')
      })
      expect(
        (await page!.context().cookies()).some(
          (cookie) => cookie.name === 'next-instant-navigation-testing'
        )
      ).toBe(false)
    } finally {
      await browser.close()
    }
  })
})
