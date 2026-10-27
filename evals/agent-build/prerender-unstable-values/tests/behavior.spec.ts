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
  // React also leaves an empty <template> placeholder where a Suspense
  // boundary streams in later; the fallback text around it is in the shell.
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<template[^>]*><\/template>/g, '')
}

// What a visitor reads: scripts and styles dropped, tags removed, whitespace
// collapsed. Content checks use this, so markup around a value (a <span>, a
// Suspense placeholder, an inline script) does not change the result.
function text(html: string): string {
  return clean(html)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
}

// The visible text of every <h1>.
function headings(html: string): string[] {
  return [...clean(html).matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) =>
    text(m[1]).trim()
  )
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
  expect(text(prerendered)).toContain('Know before your customers do')
  expect(
    text(prerendered),
    'the footer year must be in the static shell'
  ).toContain(`© ${year} Pulse`)

  const response = await request.get(baseURL + '/')
  expect(response.status()).toBe(200)
  expect(text(await response.text())).toContain(`© ${year} Pulse`)
})

test('the prerendered status page carries the cached checked-at time and absolute start times', async ({
  request,
}) => {
  const prerendered = shell('status')
  expect(text(prerendered)).toContain('System status')
  expect(text(prerendered)).toContain('Elevated latency in eu-central')
  expect(text(prerendered)).toContain('Intermittent sign-in failures')
  expect(text(prerendered)).toContain(
    'Delayed delivery for a subset of endpoints'
  )
  expect(
    text(prerendered),
    'the footer year must be in the static shell'
  ).toContain(`© ${year} Pulse`)

  const stamp = checkedAt(prerendered)
  expect(stamp).toMatch(checkedAtPattern)

  // The instruction leaves the server rendering of start times open: an
  // absolute time, a relative time as of the fetch, or a Suspense fallback are
  // all accepted. Whether each becomes the visitor's live relative time is
  // checked in the browser with a pinned clock.
  for (const text of relativeTimeTexts(prerendered)) {
    expect(text).not.toContain('NaN')
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
  expect(headings(prerendered)).toContain('Account')
  expect(text(prerendered)).toContain(`© ${year} Pulse`)
  expect(text(prerendered)).not.toContain('Ada Lovelace')
  expect(text(prerendered)).not.toContain('Grace Hopper')
})

test('incident start times become live relative times after hydration', async ({
  page,
}) => {
  // Pin the browser clock three days after the first incident started, so
  // wording computed on the server (or kept from it by a suppressed
  // mismatch) cannot pass for the visitor's own clock.
  await page.clock.setFixedTime(new Date('2026-10-23T08:12:00.000Z'))
  const issues = await collectHydrationIssues(page)
  await page.goto(baseURL + '/status')

  const times = page.getByTestId('relative-time')
  await expect(times).toHaveCount(3)
  for (let index = 0; index < 3; index++) {
    await expect(times.nth(index)).toHaveText(relativePattern)
  }
  await expect(times.first()).toHaveText(/\b3\s*(?:days?|d)\b/i)

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
  expect(headings(signedOutHtml)).toContain('Account')
  expect(signedOutHtml).toContain('data-testid="signed-out"')
  expect(text(signedOutHtml)).not.toContain('Ada Lovelace')

  const ada = await request.get(baseURL + '/account', {
    headers: { cookie: 'pulse_customer=ada' },
  })
  expect(ada.status()).toBe(200)
  const adaHtml = clean(await ada.text())
  expect(text(adaHtml)).toContain('Ada Lovelace')
  expect(text(adaHtml)).toContain('enterprise')
  expect(text(adaHtml)).toContain('48')

  const grace = await request.get(baseURL + '/account', {
    headers: { cookie: 'pulse_customer=grace' },
  })
  const graceHtml = clean(await grace.text())
  expect(text(graceHtml)).toContain('Grace Hopper')
  expect(text(graceHtml)).toContain('team')
  expect(text(graceHtml)).not.toContain('Ada Lovelace')

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
