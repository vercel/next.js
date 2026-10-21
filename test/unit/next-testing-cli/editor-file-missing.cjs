const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const { setTimeout: delay } = require('node:timers/promises')

const [pkg, root, evidence] = process.argv.slice(2)
assert(pkg && root && evidence)
fs.mkdirSync(root, { recursive: true })
fs.mkdirSync(evidence, { recursive: true })
const fixture = path.join(__dirname, 'fixtures/editor-file-missing')
const target = path.join(root, 'only.test.mjs')
const other = path.join(root, 'similar-only.test.mjs')
for (const name of ['only.test.mjs', 'similar-only.test.mjs'])
  fs.copyFileSync(path.join(fixture, name + '.txt'), path.join(root, name))
const otherSource = fs.readFileSync(other)
fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}\n')
fs.writeFileSync(
  path.join(root, 'next.test.config.json'),
  JSON.stringify({
    projects: [
      {
        name: 'files',
        environment: 'node',
        mode: 'development',
        include: ['*.test.mjs'],
        passWithNoTests: true,
      },
    ],
  })
)

// Remove the acknowledged selection synchronously before its run owner starts.
// Only this process's actual HTTP response is observed; product exports stay held.
const originalCreateServer = http.createServer
let deleted = false
http.createServer = function (...args) {
  const listener = args[0]
  if (typeof listener === 'function')
    args[0] = function (request, response) {
      if (
        request.method === 'POST' &&
        /^\/v1\/runs\/[^/]+\/files\/[^/]+\/rerun$/.test(request.url || '')
      ) {
        response.prependOnceListener('finish', () => {
          assert.equal(deleted, false)
          fs.unlinkSync(target)
          deleted = true
        })
      }
      return Reflect.apply(listener, this, [request, response])
    }
  return Reflect.apply(originalCreateServer, this, args)
}
const { watchTests } = require(
  path.join(pkg, 'dist/experimental/testing/watch-orchestrator')
)
const { acquireTestRunLock } = require(
  path.join(pkg, 'dist/experimental/testing/scheduling')
)
const controller = new AbortController()
let output = '',
  errorOutput = '',
  url,
  operation
const events = []
async function poll(check) {
  const deadline = Date.now() + 30000
  let last
  while (Date.now() < deadline) {
    try {
      return await check()
    } catch (error) {
      last = error
    }
    await delay(100)
  }
  throw last
}
async function current() {
  assert(url)
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
  assert.equal(response.status, 200)
  return response.json()
}
async function main() {
  operation = watchTests(root, {
    signal: controller.signal,
    apiPort: 0,
    write(text) {
      output += text
    },
    writeError(text) {
      errorOutput += text
      const match =
        /Next test discovery API: (http:\/\/127\.0\.0\.1:\d+\/v1\/discovery)/.exec(
          errorOutput
        )
      if (match) url = match[1]
    },
    onEvent(event) {
      events.push(event)
    },
  })
  const first = await poll(async () => {
    const value = await current()
    assert.equal(value.run?.status, 'passed')
    assert.equal(value.cases.length, 2)
    return value
  })
  const file = first.files.find((file) => file.file === 'only.test.mjs')
  assert(file)
  const response = await fetch(
    new URL(
      '/v1/runs/' +
        encodeURIComponent(first.run.id) +
        '/files/' +
        encodeURIComponent(file.id) +
        '/rerun',
      url
    ),
    {
      method: 'POST',
      signal: AbortSignal.timeout(5000),
    }
  )
  assert.equal(response.status, 202)
  const acknowledgement = await response.json()
  const failed = await poll(async () => {
    const value = await current()
    assert.notEqual(value.run?.id, first.run.id)
    assert.equal(value.run?.status, 'failed')
    assert.equal(value.cases.length, 0)
    assert.equal(value.files.length, 1)
    return value
  })
  assert(deleted)
  assert(output.includes('Requested editor file is no longer discoverable.'))
  assert.deepEqual(fs.readFileSync(other), otherSource)
  const runs = events.filter((event) => event.type === 'run-start')
  assert.equal(runs.length, 2)
  assert.equal(events.filter((event) => event.type === 'case-start').length, 2)
  controller.abort(new Error('Owned missing-file probe complete'))
  const result = await operation
  assert.equal(result.status, 'cancelled')
  assert.deepEqual(
    fs.readdirSync(root).filter((name) => name.startsWith('.next-test-')),
    []
  )
  await assert.rejects(fetch(url, { signal: AbortSignal.timeout(5000) }))
  const lock = await acquireTestRunLock(root, { recoverSnapshots: false })
  await lock.unlock()
  fs.writeFileSync(
    path.join(evidence, 'completed.json'),
    JSON.stringify(
      {
        first,
        acknowledgement,
        failed,
        events,
        result,
        deleted,
        otherSourceHeld: true,
        output,
        errorOutput,
      },
      null,
      2
    )
  )
  console.log(
    JSON.stringify({
      runs: runs.length,
      removedSelectionFailed: true,
      otherFileNotRun: true,
      passWithNoTestsNotApplied: true,
      cleanupHeld: true,
    })
  )
}
main()
  .catch((error) => {
    console.error(error.stack, output, errorOutput)
    process.exitCode = 1
  })
  .finally(async () => {
    controller.abort(new Error('Owned probe cleanup'))
    try {
      if (operation) await operation
    } finally {
      http.createServer = originalCreateServer
    }
  })
