import { expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { securityChecks } from './checks/EVAL'

const { target } = JSON.parse(
  readFileSync('/tmp/next-upgrade-eval/security/assessment.json', 'utf8')
) as { target: string }

securityChecks(
  '13.5.11',
  target,
  (app) => {
    test('completes the async request API migration', () => {
      const source = readFileSync(join(app.cwd, 'lib/viewer.ts'), 'utf8')
      expect(source).not.toContain('@next-codemod-')
      expect(source).not.toContain('UnsafeUnwrapped')
    })

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
    changedFiles: [
      'app/page.tsx',
      'eslint.config.mjs',
      'lib/viewer.ts',
      'next.config.js',
      'package.json',
    ],
    migrationGuides: [14, 15, 16],
    upgradeType: 'latest',
  }
)
