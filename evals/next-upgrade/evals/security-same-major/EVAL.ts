import { expect, test } from 'vitest'
import { securityChecks } from './checks/EVAL'

securityChecks('15.5.23', '15.5.24', (app) => {
  test('preserves request identity between visitors', async () => {
    await Promise.all(
      [
        ['Alice', 'fr'],
        ['Bob', 'de'],
        ['Guest', 'en'],
      ].map(async ([name, language]) => {
        const headers: Record<string, string> = {
          'accept-language': language,
        }
        if (name !== 'Guest') headers.cookie = `member=${name}`

        const [page, api] = await Promise.all([
          fetch(app.url, { headers }),
          fetch(`${app.url}/api/viewer`, { headers }),
        ])
        expect(page.status).toBe(200)
        expect(api.status).toBe(200)
        const html = await page.text()
        expect(html).toContain(`id="member">${name}<`)
        expect(html).toContain(`id="language">${language}<`)
        expect(await api.json()).toEqual({ name, language })
      })
    )
  })
})
