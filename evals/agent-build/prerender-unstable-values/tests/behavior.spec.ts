import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { instant } from '@next/playwright'

const baseURL = process.env.EVAL_BASE_URL ?? 'http://127.0.0.1:3010'
const appRoot = process.env.EVAL_APP_ROOT ?? '/app'

// The prerendered HTML the build wrote. A live response streams the whole
// page, so only these files prove what is in the static shell.
function shell(name: string): string {
  return clean(
    readFileSync(join(appRoot, '.next/server/app', `${name}.html`), 'utf8')
  )
}
const year = String(new Date().getFullYear())
const checkedAtPattern = /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC/
const relativePattern = /\bago\b|yesterday|just now|last (?:week|month)/i

// React separates adjacent text and expressions with comment nodes, so strip
// them before any substring check.
function clean(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, '')
}

function checkedAt(html: string): string {
  const match = html.match(
    /data-testid="checked-at"[\s\S]*?(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC)/
  )
  expect(
    match,
    'the status page must render a "Checked at" time'
  ).not.toBeNull()
  return match![1]
}

function relativeTimeTexts(html: string): string[] {
  return [...html.matchAll(/data-testid="relative-time"[^>]*>([^<]*)</g)].map(
    (m) => m[1].trim()
  )
}

async function collectHydrationIssues(page: Page): Promise<string[]> {
  const issues: string[] = []
  page.on('pageerror', (error) => issues.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') issues.push(message.text())
  })
  return issues
}

test('the prerendered home page is complete, including the footer year', async ({
  request,
}) => {
  const prerendered = shell('index')
  expect(prerendered).toContain('Know before your customers do')
  expect(prerendered, 'the footer year must be in the static shell').toContain(
    `© ${year} Pulse`
  )

  const response = await request.get(baseURL + '/')
  expect(response.status()).toBe(200)
  expect(clean(await response.text())).toContain(`© ${year} Pulse`)
})

test('the prerendered status page carries the cached checked-at time and absolute start times', async ({
  request,
}) => {
  const prerendered = shell('status')
  expect(prerendered).toContain('System status')
  expect(prerendered).toContain('Elevated latency in eu-central')
  expect(prerendered).toContain('Intermittent sign-in failures')
  expect(prerendered).toContain('Delayed delivery for a subset of endpoints')
  expect(prerendered, 'the footer year must be in the static shell').toContain(
    `© ${year} Pulse`
  )

  const stamp = checkedAt(prerendered)
  expect(stamp).toMatch(checkedAtPattern)

  const texts = relativeTimeTexts(prerendered)
  expect(texts, 'all three incidents render a start time').toHaveLength(3)
  for (const text of texts) {
    expect(text.length).toBeGreaterThan(0)
    expect(text).not.toContain('NaN')
    expect(
      text,
      'relative wording must not be baked into the HTML'
    ).not.toMatch(relativePattern)
  }

  // Every visitor sees the snapshot's time until the cache refreshes.
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await request.get(baseURL + '/status')
    expect(response.status()).toBe(200)
    expect(checkedAt(clean(await response.text()))).toBe(stamp)
  }
})

test('the prerendered account page is a shell without customer data', async () => {
  const prerendered = shell('account')
  expect(prerendered).toContain('Account</h1>')
  expect(prerendered).toContain(`© ${year} Pulse`)
  expect(prerendered).not.toContain('Ada Lovelace')
  expect(prerendered).not.toContain('Grace Hopper')
})

test('incident start times become live relative times after hydration', async ({
  page,
}) => {
  const issues = await collectHydrationIssues(page)
  await page.goto(baseURL + '/status')

  const times = page.getByTestId('relative-time')
  await expect(times).toHaveCount(3)
  for (let index = 0; index < 3; index++) {
    await expect(times.nth(index)).toHaveText(relativePattern)
  }

  await page.waitForTimeout(500)
  expect(
    issues.filter((text) =>
      /hydrat|did not match|Minified React error/i.test(text)
    ),
    'no hydration errors'
  ).toEqual([])
})

test('client navigation to status and account is instant', async ({ page }) => {
  await page.goto(baseURL)

  await instant(page, async () => {
    await page.getByRole('link', { name: 'Status', exact: true }).click()
    await expect(
      page.getByRole('heading', { name: 'System status' })
    ).toBeVisible()
  })

  await page.goto(baseURL)
  await instant(page, async () => {
    await page.getByRole('link', { name: 'Account', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible()
  })
})

test('the account page streams the signed-in customer and isolates visitors', async ({
  request,
}) => {
  const signedOut = await request.get(baseURL + '/account')
  expect(signedOut.status()).toBe(200)
  const signedOutHtml = clean(await signedOut.text())
  expect(signedOutHtml).toContain('Account</h1>')
  expect(signedOutHtml).toContain('data-testid="signed-out"')
  expect(signedOutHtml).not.toContain('Ada Lovelace')

  const ada = await request.get(baseURL + '/account', {
    headers: { cookie: 'pulse_customer=ada' },
  })
  expect(ada.status()).toBe(200)
  const adaHtml = clean(await ada.text())
  expect(adaHtml).toContain('Ada Lovelace')
  expect(adaHtml).toContain('enterprise')
  expect(adaHtml).toContain('48')

  const grace = await request.get(baseURL + '/account', {
    headers: { cookie: 'pulse_customer=grace' },
  })
  const graceHtml = clean(await grace.text())
  expect(graceHtml).toContain('Grace Hopper')
  expect(graceHtml).toContain('team')
  expect(graceHtml).not.toContain('Ada Lovelace')

  // Prefetch and navigation renders are where a request-time clock read
  // leaks into the server log after the build is green. Issue both so the
  // log check in test.sh sees them.
  for (const headers of [
    {
      rsc: '1',
      'next-router-prefetch': '1',
      'next-router-segment-prefetch': '/_tree',
    },
    {
      rsc: '1',
      'next-router-prefetch': '1',
      'next-router-segment-prefetch': '/_full',
    },
    { rsc: '1' },
  ]) {
    const response = await request.get(baseURL + '/account', {
      headers: { cookie: 'pulse_customer=grace', ...headers },
    })
    expect(response.status()).toBeLessThan(500)
  }
})
