import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
const child = process.argv[2] === '--child'
const [consumerArg, outputArg, driverArg = consumerArg] = process.argv.slice(
  child ? 3 : 2
)
assert(
  consumerArg && outputArg,
  'Usage: node verify-owner.mjs <consumer> <new-output> [driver-root]'
)
const consumer = fs.realpathSync(consumerArg),
  output = path.resolve(outputArg),
  driver = fs.realpathSync(driverArg)
if (!child) {
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.mkdirSync(output)
  const env = { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }
  for (const key of [
    'CI',
    'NODE_OPTIONS',
    'NODE_PATH',
    'NEXT_TEST_NATIVE_DIR',
    'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
  ])
    delete env[key]
  const owner = await runOwnedNode(
    [fileURLToPath(import.meta.url), '--child', consumer, output, driver],
    { cwd: consumer, env, auditDir: output + '/owners', timeoutMs: 120000 }
  )
  fs.writeFileSync(
    output + '/owner.json',
    JSON.stringify(owner, null, 2) + '\n'
  )
  fs.writeFileSync(output + '/stdout.log', owner.stdout)
  fs.writeFileSync(output + '/stderr.log', owner.stderr)
  assertOwnedNodeCompleted(
    owner,
    'actual Firefox live/detached/replaced/stale frame ownership'
  )
  assert.equal(owner.status, 0)
  fs.writeFileSync(
    output + '/VERIFIED.json',
    JSON.stringify(
      {
        cases: 4,
        actualNativeOwnerRefusals: true,
        allOwnersJoined: true,
        geometryBeforeAfterRefusalRetained: true,
        noPublicViewportFailureParityClaimFromInternalControl: true,
      },
      null,
      2
    ) + '\n'
  )
} else {
  const require = createRequire(consumer + '/package.json'),
    dependency = createRequire(driver + '/package.json')
  const {
    createBrowserHost,
    connectBrowserHost,
  } = require('next/dist/experimental/testing/browser/host')
  assert(fs.existsSync(dependency('playwright').firefox.executablePath()))
  const html = fs.readFileSync(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      'frame-host.html.txt'
    ),
    'utf8'
  )
  const controller = new AbortController()
  let host, browser, context
  const errors = {}
  try {
    host = await createBrowserHost({
      projectDir: driver,
      signal: controller.signal,
      engine: 'firefox',
      headless: true,
      ownedFrames: true,
    })
    browser = await connectBrowserHost({
      projectDir: driver,
      wsEndpoint: host.wsEndpoint,
      engine: 'firefox',
      timeout: 30000,
    })
    context = await browser.newContext({
      viewport: { width: 414, height: 896 },
    })
    const page = await context.newPage()
    await page.setContent(html, { waitUntil: 'load', timeout: 30000 })
    const element = await page
      .locator('iframe')
      .elementHandle({ timeout: 30000 })
    assert(element)
    const frame = await element.contentFrame()
    await element.dispose()
    assert(frame)
    const owner = host.frameOwner(context, page, frame)
    owner.assertCurrent()
    const originalNativeId = owner.nativeFrameId()
    assert.equal(owner.engine, 'firefox')
    assert.equal(frame.parentFrame(), page.mainFrame())
    assert.equal(frame.page(), page)
    const viewportBefore = page.viewportSize()
    const detached = page.waitForEvent('framedetached', {
      predicate: (value) => value === frame,
      timeout: 10000,
    })
    await page.evaluate(() => {
      const previous = document.querySelector('iframe'),
        next = document.createElement('iframe')
      next.src = 'about:blank'
      previous.replaceWith(next)
    })
    await detached
    assert(frame.isDetached())
    function refusal(label, call, pattern) {
      let received
      try {
        call()
      } catch (error) {
        received = error
      }
      assert(received instanceof Error, label)
      assert.match(received.message, pattern)
      errors[label] = { name: received.name, message: received.message }
    }
    refusal(
      'detachedOriginal',
      () => owner.assertCurrent(),
      /Browser native test frame ownership is closed or changed/
    )
    const replacementElement = await page
      .locator('iframe')
      .elementHandle({ timeout: 10000 })
    assert(replacementElement)
    const replacement = await replacementElement.contentFrame()
    await replacementElement.dispose()
    assert(replacement)
    assert.notEqual(replacement, frame)
    assert.equal(replacement.parentFrame(), page.mainFrame())
    refusal(
      'replacementCannotReuseSelectedNativePage',
      () => host.frameOwner(context, page, replacement),
      /Browser page already has a different selected test frame/
    )
    const viewportAfter = page.viewportSize()
    assert.deepEqual(viewportAfter, viewportBefore)
    const stalePage = await context.newPage()
    await stalePage.setContent(html, { waitUntil: 'load', timeout: 30000 })
    const staleElement = await stalePage
      .locator('iframe')
      .elementHandle({ timeout: 10000 })
    assert(staleElement)
    const staleFrame = await staleElement.contentFrame()
    await staleElement.dispose()
    assert(staleFrame)
    const staleOwner = host.frameOwner(context, stalePage, staleFrame)
    staleOwner.assertCurrent()
    assert(!stalePage.isClosed() && !staleFrame.isDetached())
    await stalePage.close()
    refusal(
      'staleAfterPageClose',
      () => staleOwner.assertCurrent(),
      /Browser native test frame ownership is closed or changed/
    )
    await page.close()
    fs.writeFileSync(
      output + '/ACTUAL-OWNER-CONTROLS.json',
      JSON.stringify(
        {
          engine: 'firefox',
          driver: dependency('playwright/package.json').version,
          binary: dependency('playwright').firefox.executablePath(),
          originalNativeFrameId: originalNativeId,
          liveOriginalFrameWasActualDirectChild: true,
          detachedOriginalObservedThroughActualNativeEvent: true,
          replacementIsDifferentActualFrame: true,
          staleOwnerWasLiveBeforePageClose: true,
          viewportBefore,
          viewportAfter,
          actualErrors: errors,
          onlyExistingOwnerAPIUnderTest: true,
          noFakeFramesMapsErrorsOrResizeEvents: true,
          noPublicReceiverProjectionOrErrorParityClaim: true,
        },
        null,
        2
      ) + '\n'
    )
  } finally {
    const cleanup = []
    for (const close of [
      () => context?.close(),
      () => browser?.close(),
      () => host?.dispose(),
    ])
      try {
        await close()
      } catch (error) {
        cleanup.push(error)
      }
    if (cleanup.length)
      throw new globalThis.AggregateError(
        cleanup,
        'Firefox frame ownership control cleanup failed'
      )
  }
}
