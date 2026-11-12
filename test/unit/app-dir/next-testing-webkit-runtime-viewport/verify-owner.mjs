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
assert(consumerArg && outputArg)
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
  assertOwnedNodeCompleted(owner, 'actual retained WebKit main Page owner')
  assert.equal(owner.status, 0)
  fs.writeFileSync(
    output + '/VERIFIED.json',
    JSON.stringify(
      {
        cases: 3,
        actualNativeOwnerRefusals: true,
        allOwnersJoined: true,
        noPublicFailureProjectionParityClaim: true,
      },
      null,
      2
    ) + '\n'
  )
} else {
  const req = createRequire(consumer + '/package.json'),
    deps = createRequire(driver + '/package.json'),
    { createBrowserHost, connectBrowserHost } = req(
      'next/dist/experimental/testing/browser/host'
    )
  assert.equal(deps('playwright/package.json').version, '1.61.0')
  const controller = new AbortController()
  let host, browser, context, second
  try {
    host = await createBrowserHost({
      projectDir: driver,
      signal: controller.signal,
      engine: 'webkit',
      headless: true,
    })
    browser = await connectBrowserHost({
      projectDir: driver,
      wsEndpoint: host.wsEndpoint,
      engine: 'webkit',
      timeout: 30000,
    })
    context = await browser.newContext({
      viewport: { width: 414, height: 896 },
    })
    const page = await context.newPage()
    const owner = host.webKitPageOwner(context, page)
    owner.assertCurrent()
    const id = owner.mainFrameId(),
      rows = []
    async function read() {
      owner.assertCurrent()
      assert.equal(owner.mainFrameId(), id)
      assert.equal(page.frames().length, 1)
      return {
        sameActualMainFrame: true,
        mainFrameId: owner.mainFrameId(),
        sessionDisposed: owner.session.isDisposed(),
        geometry: await page.evaluate(() => ({
          inner: [innerWidth, innerHeight],
          selfIsTop: self === top,
          frameElementIsNull: frameElement === null,
        })),
      }
    }
    rows.push(await read())
    for (const [width, height] of [
      [360, 640],
      [960, 480],
    ]) {
      await page.setViewportSize({ width, height })
      const row = await read()
      assert.deepEqual(row.geometry.inner, [width, height])
      rows.push(row)
    }
    const errors = {}
    function refuses(label, operation) {
      let caught
      try {
        operation()
      } catch (error) {
        caught = error
      }
      assert(caught instanceof Error)
      assert.match(
        caught.message,
        /WebKit native page ownership is closed or changed/
      )
      errors[label] = { name: caught.name, message: caught.message }
    }
    await page.close()
    refuses('pageClosed', () => owner.assertCurrent())
    second = await browser.newContext()
    const otherPage = await second.newPage(),
      other = host.webKitPageOwner(second, otherPage)
    other.assertCurrent()
    assert(!otherPage.isClosed())
    await second.close()
    refuses('contextClosedAfterLiveOwner', () => other.assertCurrent())
    fs.writeFileSync(
      output + '/ACTUAL-OWNER-CONTROLS.json',
      JSON.stringify(
        {
          engine: 'webkit',
          driver: deps('playwright/package.json').version,
          binary: deps('playwright').webkit.executablePath(),
          sameRetainedOwnerUsedForEveryGeometryRead: true,
          actualOneMainFrame: true,
          rows,
          originalClosedErrors: errors,
          separateContextOwnerWasLiveBeforeClose: true,
          noFakePagesFramesMapsErrorsOrEvents: true,
          noPublicReceiverErrorProjectionParityClaim: true,
        },
        null,
        2
      ) + '\n'
    )
  } finally {
    const errors = []
    for (const close of [
      () => second?.close(),
      () => context?.close(),
      () => browser?.close(),
      () => host?.dispose(),
    ])
      try {
        await close()
      } catch (error) {
        errors.push(error)
      }
    if (errors.length)
      throw new globalThis.AggregateError(
        errors,
        'WebKit owner control cleanup failed'
      )
  }
}
