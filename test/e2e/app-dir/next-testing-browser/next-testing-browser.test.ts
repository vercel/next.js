import { nextTestSetup } from 'e2e-utils'
import { instant } from '@next/playwright'
import assert from 'node:assert/strict'
import { mkdtemp, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Browser } from 'playwright'
import {
  createBrowserHost,
  connectBrowserHost,
  type BrowserHost,
} from 'next/dist/experimental/testing/browser/host'
import {
  createBrowserAttempt,
  type BrowserAttempt,
} from 'next/dist/experimental/testing/browser/context'

// The established framework harness is an oracle, not the new Next runner.
// Both dev and start modes run against the real routes and instant helper.
describe('Next browser fixtures against actual application routes', () => {
  const { next } = nextTestSetup({
    files: join(
      __dirname,
      '../instant-navigation-testing-api/fixtures/default'
    ),
    skipDeployment: true,
  })
  const projectDir = join(__dirname, '../../../..')
  let host: BrowserHost
  let browser: Browser
  let attempt: BrowserAttempt
  let outputDir: string

  beforeAll(async () => {
    outputDir = await mkdtemp(join(tmpdir(), 'next-browser-oracle-'))
    host = await createBrowserHost({
      projectDir,
      signal: new AbortController().signal,
    })
    browser = await connectBrowserHost({
      projectDir,
      wsEndpoint: host.wsEndpoint,
    })
  })

  beforeEach(async () => {
    attempt = await createBrowserAttempt({
      browser,
      baseURL: next.url,
      outputDir,
      signal: new AbortController().signal,
      actionTimeout: 20_000,
    })
  })

  afterEach(async () => {
    if (attempt) {
      const attachments = await attempt.dispose()
      assert.deepEqual(
        attachments.map((attachment) => attachment.kind),
        ['screenshot', 'trace']
      )
      for (const attachment of attachments) {
        assert.ok((await stat(attachment.path)).size > 0)
      }
      assert.equal(browser.contexts().length, 0)
    }
  })

  afterAll(async () => {
    try {
      await browser?.close()
    } finally {
      await host?.dispose()
    }
  })

  it('asserts the shell during SPA navigation and full content after release', async () => {
    const { page } = attempt
    await page.goto('/')
    await instant(page, async () => {
      await page.click('#link-to-target')
      await page
        .locator('[data-testid="loading-shell"]')
        .waitFor({ state: 'visible' })
      expect(
        await page.locator('[data-testid="dynamic-content"]').count()
      ).toBe(0)
    })
    const content = page.locator('[data-testid="dynamic-content"]')
    await content.waitFor({ state: 'visible' })
    expect(await content.textContent()).toContain('Dynamic content loaded')
  })

  it('supports a fresh-page instant scope with explicit baseURL', async () => {
    const { page } = attempt
    await instant(
      page,
      async () => {
        await page.goto('/target-page')
        await page
          .locator('[data-testid="loading-shell"]')
          .waitFor({ state: 'visible' })
        expect(
          await page.locator('[data-testid="dynamic-content"]').count()
        ).toBe(0)
      },
      { baseURL: next.url }
    )
    await page
      .locator('[data-testid="dynamic-content"]')
      .waitFor({ state: 'visible' })
  })
})
