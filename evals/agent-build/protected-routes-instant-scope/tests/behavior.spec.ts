import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { instant } from '@next/playwright'

const baseURL = process.env.EVAL_BASE_URL ?? 'http://127.0.0.1:3010'
const appRoot = process.env.EVAL_APP_ROOT ?? '/app'

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

// The visible text of the element carrying a data-testid, nested markup
// included.
function testidText(html: string, id: string): string {
  const source = clean(html)
  const start = source.indexOf(`data-testid="${id}"`)
  if (start === -1) return ''
  const open = source.indexOf('>', start) + 1
  let depth = 1
  const tag = /<(\/?)([a-zA-Z][\w-]*)[^>]*?(\/?)>/g
  tag.lastIndex = open
  for (let m = tag.exec(source); m; m = tag.exec(source)) {
    const voidTag = /^(br|img|input|hr|meta|link)$/i.test(m[2]) || m[3] === '/'
    if (m[1]) depth--
    else if (!voidTag) depth++
    if (depth === 0) return text(source.slice(open, m.index)).trim()
  }
  return ''
}

// The prerendered HTML the build wrote. A route without one has no static
// shell and cannot navigate instantly.
function shell(name: string): string {
  const path = join(appRoot, '.next/server/app', `${name}.html`)
  expect(existsSync(path), `${name} must have a prerendered shell`).toBe(true)
  return clean(readFileSync(path, 'utf8'))
}

const ada = { cookie: 'ledger_session=tok_ada' }
const alan = { cookie: 'ledger_session=tok_alan' }
const expired = { cookie: 'ledger_session=tok_expired' }

test('marketing pages stay static', async () => {
  expect(text(shell('index'))).toContain('Invoices your customers actually pay')
  expect(headings(shell('pricing'))).toContain('Pricing')
  expect(text(shell('login'))).toContain('Sign in to Ledger')
})

test('every workspace route has a shell with the frame and no customer data', async () => {
  const pages = [
    ['app', 'Overview'],
    ['app/invoices', 'Invoices'],
    ['app/settings', 'Settings'],
  ]
  for (const [name, heading] of pages) {
    const html = shell(name)
    expect(html, `${name} shell has the workspace frame`).toContain(
      'data-testid="workspace-nav"'
    )
    expect(headings(html), `${name} shell has its page heading`).toContain(
      heading
    )
    for (const value of [
      'Sign in required',
      'Ada Lovelace',
      'Alan Turing',
      'Analytical Engines',
      'Bletchley',
    ]) {
      expect(text(html)).not.toContain(value)
    }
  }
})

test('signed-out visitors get a real HTTP redirect to the login page', async ({
  request,
}) => {
  for (const path of ['/app', '/app/invoices', '/app/settings']) {
    const response = await request.get(baseURL + path, {
      maxRedirects: 0,
    })
    expect(response.status(), `${path} redirects`).toBeGreaterThanOrEqual(300)
    expect(response.status(), `${path} redirects`).toBeLessThan(400)
    expect(response.headers()['location'] ?? '').toContain('/login')
  }
})

test('signed-in visitors see their own workspace', async ({ request }) => {
  const overview = clean(
    await (await request.get(baseURL + '/app', { headers: ada })).text()
  )
  expect(text(overview)).toContain('Welcome back, Ada Lovelace.')
  expect(text(overview)).toContain('Analytical Engines')
  expect(testidText(overview, 'outstanding')).toBe('$1660')
  expect(testidText(overview, 'overdue')).toBe('1')

  const other = clean(
    await (await request.get(baseURL + '/app', { headers: alan })).text()
  )
  expect(text(other)).toContain('Welcome back, Alan Turing.')
  expect(text(other)).toContain('Bletchley')
  expect(testidText(other, 'outstanding')).toBe('$300')
  expect(text(other)).not.toContain('Ada Lovelace')

  const settings = clean(
    await (
      await request.get(baseURL + '/app/settings', { headers: alan })
    ).text()
  )
  expect(testidText(settings, 'settings-team')).toBe('Bletchley')
  expect(text(settings)).toContain('INV-2xxx')
})

test('expired sessions never see workspace data', async ({ request }) => {
  const response = await request.get(baseURL + '/app', {
    headers: expired,
    maxRedirects: 0,
  })
  const html = clean(await response.text())
  expect(text(html)).not.toContain('Expired User')
  expect(html).not.toContain('data-testid="outstanding"')
  if (response.status() === 200) {
    expect(html, 'a streamed response must redirect to login').toContain(
      '/login'
    )
  } else {
    expect(response.headers()['location'] ?? '').toContain('/login')
  }
})

test('the invoice filter reads the URL', async ({ request }) => {
  const open = clean(
    await (
      await request.get(baseURL + '/app/invoices?status=open', {
        headers: ada,
      })
    ).text()
  )
  expect(open).toContain('data-invoice="INV-1041"')
  expect(open).not.toContain('data-invoice="INV-1040"')
  expect(open).not.toContain('data-invoice="INV-1039"')

  const paid = clean(
    await (
      await request.get(baseURL + '/app/invoices?status=paid', {
        headers: ada,
      })
    ).text()
  )
  expect(paid).toContain('data-invoice="INV-1040"')
  expect(paid).toContain('data-invoice="INV-1038"')
  expect(paid).not.toContain('data-invoice="INV-1041"')

  const all = clean(
    await (
      await request.get(baseURL + '/app/invoices', { headers: ada })
    ).text()
  )
  expect(all).toContain('data-invoice="INV-1041"')
  expect(all).toContain('data-invoice="INV-1040"')
  expect(all).not.toContain('data-invoice="INV-2007"')
})

test('workspace navigation is instant once signed in', async ({ page }) => {
  await page.goto(baseURL + '/login/as?user=ada')
  // A loading fallback may reuse the test id, so match only what is shown.
  await expect(
    page.getByTestId('greeting').filter({ visible: true })
  ).toHaveText('Welcome back, Ada Lovelace.')

  await instant(page, async () => {
    await page.getByRole('link', { name: 'Invoices', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Invoices' })).toBeVisible()
  })
  await expect(page.locator('[data-invoice="INV-1041"]')).toBeVisible()

  await instant(page, async () => {
    await page.getByRole('link', { name: 'Settings', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  })
  await expect(
    page.getByTestId('settings-team').filter({ visible: true })
  ).toHaveText('Analytical Engines')

  await page.goto(baseURL + '/')
  await instant(page, async () => {
    await page.getByRole('link', { name: 'Workspace', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
  })
})
