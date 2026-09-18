import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import {
  createApplicationServer,
  ApplicationServerError,
  type ApplicationServer,
} from 'next/dist/experimental/testing/browser/server'
import {
  createBrowserHost,
  type BrowserHost,
} from 'next/dist/experimental/testing/browser/host'
import { createBrowserFixture } from 'next/dist/experimental/testing/browser/fixture'

// The framework harness only prepares an exclusive app install. H owns the
// actual server and browser processes. The driver compiler/runner is separate.
describe('Next-managed application-server lease', () => {
  const { next } = nextTestSetup({
    files: join(__dirname, '../../../e2e/app-dir/next-testing-reference'),
    skipStart: true,
  })
  const projectDir = join(__dirname, '../../../..')
  let server: ApplicationServer | undefined
  let browser: BrowserHost | undefined
  let outputDir: string
  let cleanups: Array<() => Promise<void>>

  beforeEach(async () => {
    outputDir = await mkdtemp(join(tmpdir(), 'next-app-server-evidence-'))
    server = undefined
    browser = undefined
    cleanups = []
  })

  afterEach(async () => {
    const errors: unknown[] = []
    for (const cleanup of [
      ...cleanups.reverse(),
      () => browser?.dispose(),
      () => server?.dispose(),
    ]) {
      try {
        await cleanup()
      } catch (error) {
        errors.push(error)
      }
    }
    assert.deepEqual(errors, [])
  })

  function acquire() {
    return createApplicationServer({
      projectDir: next.testDir,
      mode: 'development',
      // This canonical oracle uses the enabled default. In the actual runner,
      // A supplies evidence from its resolved config and I checks it first.
      outputLockEnabled: true,
      outputDir,
      signal: new AbortController().signal,
      startupTimeoutMs: 30_000,
      shutdownGraceMs: 5_000,
    })
  }

  it('serves an instant shell, releases dynamic data and hydrates real client code', async () => {
    server = await acquire()
    browser = await createBrowserHost({
      projectDir,
      signal: new AbortController().signal,
    })
    const attachments: string[] = []
    const fixture = await createBrowserFixture({
      projectDir,
      wsEndpoint: browser.wsEndpoint,
      baseURL: server.baseURL,
      outputDir,
      attempt: {
        signal: new AbortController().signal,
        onCleanup(cleanup) {
          cleanups.push(cleanup)
        },
      },
      onAttachment(attachment) {
        attachments.push(attachment.kind)
      },
    })
    await fixture.page.goto('/')
    await fixture.instant(async () => {
      await fixture.page.click('#reference-link')
      await fixture.page.locator('#loading').waitFor({ state: 'visible' })
      expect(await fixture.page.locator('h1').textContent()).toBe(
        'Reference shell'
      )
      expect(await fixture.page.locator('#completed').count()).toBe(0)
    })
    await fixture.page.locator('#completed').waitFor({ state: 'visible' })
    expect(await fixture.page.locator('#nested-message').textContent()).toBe(
      'server sum: 10'
    )
    await fixture.page.click('#counter')
    await retry(async () => {
      expect(await fixture.page.locator('#counter').textContent()).toBe(
        'Count: 11'
      )
    })
    await cleanups[0]()
    expect(attachments).toEqual(['screenshot', 'trace'])
    const pid = server.pid
    const disposal = server.dispose()
    expect(server.dispose()).toBe(disposal)
    await disposal
    expect(() => process.kill(pid, 0)).toThrow()
    expect(server.attachments.map((attachment) => attachment.kind)).toEqual([
      'file',
      'file',
    ])
  })

  it('rejects output owned by an external next dev and leaves that server running', async () => {
    await next.start()
    try {
      let error: unknown
      try {
        server = await acquire()
      } catch (caught) {
        error = caught
      }
      expect(error).toBeInstanceOf(ApplicationServerError)
      const logs = await Promise.all(
        (error as ApplicationServerError).attachments.map((attachment) =>
          readFile(attachment.path, 'utf8')
        )
      )
      expect(logs.join('\n')).toContain('already running')
      expect((await next.fetch('/reference')).status).toBe(200)
    } finally {
      await next.stop()
    }
  })
})
