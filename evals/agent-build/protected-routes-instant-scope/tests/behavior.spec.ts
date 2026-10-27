import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { instant } from '@next/playwright'

const baseURL = process.env.EVAL_BASE_URL ?? 'http://127.0.0.1:3010'
const appRoot = process.env.EVAL_APP_ROOT ?? '/app'

function clean(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, '')
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
  expect(shell('index')).toContain('Invoices your customers actually pay')
  expect(shell('pricing')).toContain('Pricing</h1>')
  expect(shell('login')).toContain('Sign in to Ledger')
})

test('every workspace route has a shell with the frame and no customer data', async () => {
  const pages = [
    ['app', 'Overview</h1>'],
    ['app/invoices', 'Invoices</h1>'],
    ['app/settings', 'Settings</h1>'],
  ]
  for (const [name, heading] of pages) {
    const html = shell(name)
    expect(html, `${name} shell has the workspace frame`).toContain(
      'data-testid="workspace-nav"'
    )
    expect(html, `${name} shell has its page heading`).toContain(heading)
    expect(html).not.toContain('Sign in required')
    expect(html).not.toContain('Ada Lovelace')
    expect(html).not.toContain('Alan Turing')
    expect(html).not.toContain('Analytical Engines')
    expect(html).not.toContain('Bletchley')
  }
  expect(shell('app/invoices')).toContain('aria-label="Filter"')
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
  expect(overview).toContain('Welcome back, Ada Lovelace.')
  expect(overview).toContain('Analytical Engines')
  expect(overview).toContain('data-testid="outstanding">$1660<')
  expect(overview).toContain('data-testid="overdue">1<')

  const other = clean(
    await (await request.get(baseURL + '/app', { headers: alan })).text()
  )
  expect(other).toContain('Welcome back, Alan Turing.')
  expect(other).toContain('Bletchley')
  expect(other).toContain('data-testid="outstanding">$300<')
  expect(other).not.toContain('Ada Lovelace')

  const settings = clean(
    await (
      await request.get(baseURL + '/app/settings', { headers: alan })
    ).text()
  )
  expect(settings).toContain('data-testid="settings-team">Bletchley<')
  expect(settings).toContain('INV-2xxx')
})

test('expired sessions never see workspace data', async ({ request }) => {
  const response = await request.get(baseURL + '/app', {
    headers: expired,
    maxRedirects: 0,
  })
  const html = clean(await response.text())
  expect(html).not.toContain('Expired User')
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
  await expect(page.getByTestId('greeting')).toHaveText(
    'Welcome back, Ada Lovelace.'
  )

  await instant(page, async () => {
    await page.getByRole('link', { name: 'Invoices', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Invoices' })).toBeVisible()
  })
  await expect(page.locator('[data-invoice="INV-1041"]')).toBeVisible()

  await instant(page, async () => {
    await page.getByRole('link', { name: 'Settings', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  })
  await expect(page.getByTestId('settings-team')).toHaveText(
    'Analytical Engines'
  )

  await page.goto(baseURL + '/')
  await instant(page, async () => {
    await page.getByRole('link', { name: 'Workspace', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
  })
})
