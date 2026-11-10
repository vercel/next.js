import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { chromium, expect as browserExpect } from '@playwright/test'
import { expect, test } from 'vitest'
import {
  buildNextApp,
  startNextServer,
} from './__agent_eval__/next-test-utils.mjs'

type Report = {
  errors: unknown[]
  stats: {
    expected: number
    unexpected: number
    skipped: number
    flaky: number
  }
  suites: {
    specs: { tests: { results: { errors: { message?: string }[] }[] }[] }[]
    suites: Report['suites']
  }[]
}

async function runTests(url: string, label: string): Promise<Report> {
  const cli = createRequire(resolve('package.json')).resolve(
    '@playwright/test/cli'
  )
  let stdout: string
  try {
    ;({ stdout } = await promisify(execFile)(
      process.execPath,
      [cli, 'test', '--config=playwright.config.ts', '--reporter=json'],
      {
        env: { ...process.env, PLAYWRIGHT_BASE_URL: url },
        timeout: 90_000,
        maxBuffer: 5 * 1024 * 1024,
      }
    ))
  } catch (error) {
    const failure = error as { code?: number; stdout?: string }
    // Playwright returns 1 for failed tests. Other failures are not evidence
    // that the submitted test caught the regression.
    if (failure.code !== 1 || !failure.stdout) throw error
    stdout = failure.stdout
  }
  writeFileSync(`__agent_eval__/instant-test-${label}.json`, stdout)
  return JSON.parse(stdout)
}

function assertionErrors(suites: Report['suites']): string[] {
  return suites.flatMap((suite) => [
    ...suite.specs.flatMap((spec) =>
      spec.tests.flatMap((item) =>
        item.results.flatMap((result) =>
          result.errors.map((error) => error.message || '')
        )
      )
    ),
    ...assertionErrors(suite.suites || []),
  ])
}

test('the test passes the instant page and catches blocked product details', async () => {
  const hashes = JSON.parse(
    readFileSync('__eval__/fixture-hashes.json', 'utf8')
  ) as Record<string, string>
  for (const [file, hash] of Object.entries(hashes)) {
    expect(
      createHash('sha256').update(readFileSync(file)).digest('hex'),
      `Keep the supplied application and Playwright configuration unchanged: ${file}`
    ).toBe(hash)
  }

  await buildNextApp()
  const working = await startNextServer()
  try {
    const report = await runTests(working.url, 'working')
    expect(report.errors).toEqual([])
    expect(report.stats.expected).toBeGreaterThan(0)
    expect(
      report.stats.unexpected + report.stats.skipped + report.stats.flaky
    ).toBe(0)
  } finally {
    await working.stop()
  }

  const pagePath = 'app/store/[slug]/page.tsx'
  const original = readFileSync(pagePath, 'utf8')
  try {
    // The completed page remains correct, but its product details now require
    // a runtime response. Assertions on the completed page alone miss this.
    writeFileSync(
      pagePath,
      original.replace(
        'const product = await getProduct(slug)',
        'await getStock(slug)\n  const product = await getProduct(slug)'
      )
    )
    await buildNextApp()
    const blocked = await startNextServer()
    try {
      const browser = await chromium.launch()
      try {
        const page = await browser.newPage()
        await page.goto(`${blocked.url}/store/shoes`)
        await page.getByRole('link', { name: 'Hats', exact: true }).click()
        await browserExpect(
          page.getByRole('heading', { name: 'Baseball Cap' })
        ).toBeVisible()
        await browserExpect(
          page.getByText('Price: $24.00', { exact: true })
        ).toBeVisible()
        await browserExpect(
          page.getByText('5 in stock', { exact: true })
        ).toBeVisible()
      } finally {
        await browser.close()
      }

      const report = await runTests(blocked.url, 'blocked')
      expect(report.errors).toEqual([])
      expect(report.stats.skipped + report.stats.flaky).toBe(0)
      expect(report.stats.unexpected).toBeGreaterThan(0)
      expect(
        assertionErrors(report.suites).some((message) =>
          /expect\(/.test(message)
        )
      ).toBe(true)
    } finally {
      await blocked.stop()
    }
  } finally {
    writeFileSync(pagePath, original)
  }
}, 480_000)
