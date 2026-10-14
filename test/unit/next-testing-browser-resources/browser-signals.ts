import assert from 'node:assert/strict'
import {
  createBrowserHost,
  connectBrowserHost,
} from 'next/dist/experimental/testing/browser/host'
import { createBrowserAttempt } from 'next/dist/experimental/testing/browser/context'

const exitCodes = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129 }

// This host-level probe supplies its own coordinator handlers. It does not
// expand the CLI's graceful cancellation contract beyond SIGINT/SIGTERM.
async function main() {
  const signal = process.argv[2] as keyof typeof exitCodes
  assert.ok(Object.hasOwn(exitCodes, signal))
  const projectDir = process.argv[3]
  const outputDir = process.argv[4]
  const controller = new AbortController()
  const phases: string[] = []
  const received = new Promise<void>((resolve) => {
    process.once(signal, () => {
      controller.abort(new Error('Parent-owned cancellation'))
      phases.push('signal-received')
      resolve()
    })
  })
  const listeners = Object.keys(exitCodes).map((name) => ({
    name,
    handlers: process.listeners(name),
  }))
  const host = await createBrowserHost({
    projectDir,
    signal: controller.signal,
  })
  let browser: Awaited<ReturnType<typeof connectBrowserHost>> | undefined
  let attempt: Awaited<ReturnType<typeof createBrowserAttempt>> | undefined
  let attachments: Awaited<ReturnType<NonNullable<typeof attempt>['dispose']>> =
    []
  const errors: unknown[] = []
  try {
    browser = await connectBrowserHost({
      projectDir,
      wsEndpoint: host.wsEndpoint,
    })
    attempt = await createBrowserAttempt({
      browser,
      baseURL: 'http://localhost',
      outputDir,
      signal: new AbortController().signal,
    })
    await attempt.page.setContent('<h1>Parent owns browser shutdown</h1>')
    for (const { name, handlers } of listeners) {
      assert.deepEqual(
        process.listeners(name),
        handlers,
        `Browser launch took ownership of ${name}`
      )
    }
    phases.push('ready')
    // A real OS signal reaches this parent, not a synthetic AbortSignal event.
    process.kill(process.pid, signal)
    await received
    assert.equal(controller.signal.aborted, true)
    assert.equal(browser.isConnected(), true)
    assert.equal(
      await attempt.page.locator('h1').textContent(),
      'Parent owns browser shutdown'
    )
    phases.push('browser-still-usable')
    attachments = await attempt.dispose()
    phases.push('artifacts-captured')
  } catch (error) {
    errors.push(error)
  } finally {
    for (const cleanup of [
      () => attempt?.dispose(),
      () => browser?.close(),
      () => host.dispose(),
    ]) {
      try {
        await cleanup()
      } catch (error) {
        errors.push(error)
      }
    }
  }
  if (errors.length)
    throw new AggregateError(errors, 'Signal ownership check failed')
  assert.equal(browser!.isConnected(), false)
  phases.push('host-disposed')
  console.log(JSON.stringify({ signal, phases, attachments }))
  // Only the parent chooses the final status, after its terminal evidence.
  process.exitCode = exitCodes[signal]
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
