import { expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { securityChecks } from './checks/EVAL'

const { target } = JSON.parse(
  readFileSync('/tmp/next-upgrade-eval/security/assessment.json', 'utf8')
) as { target: string }

securityChecks(
  '16.2.12',
  target,
  (app) => {
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
  },
  {
    changedFiles: ['next.config.js', 'package.json'],
    migrationGuides: [16],
    upgradeType: 'latest',
  }
)
